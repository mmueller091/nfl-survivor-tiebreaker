import { assert, type Game, type GameStatus, type Team } from './domain';

const SCOREBOARD =
  'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

function team(value: any): Team {
  return {
    id: String(value.team.id),
    name: String(value.team.displayName),
    abbreviation: String(value.team.abbreviation),
    logo: value.team.logo ? String(value.team.logo) : null,
  };
}

function number(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function status(value: any): GameStatus {
  if (value?.type?.completed) return 'final';
  if (value?.type?.state === 'in') return 'in';
  if (String(value?.type?.name ?? '').includes('POSTPONED')) return 'postponed';
  return 'scheduled';
}

export async function fetchWeek(season: number, week: number): Promise<Game[]> {
  const url = new URL(SCOREBOARD);
  url.searchParams.set('dates', String(season));
  url.searchParams.set('seasontype', '2');
  url.searchParams.set('week', String(week));
  url.searchParams.set('limit', '100');
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'week-7-pool/1.0' },
  });
  assert(response.ok, 'The NFL scoreboard could not be loaded.', 502);
  const data: any = await response.json();
  const games = (data.events ?? []).map((event: any) => {
    const competition = event.competitions?.[0];
    const awayValue = competition?.competitors?.find(
      (entry: any) => entry.homeAway === 'away',
    );
    const homeValue = competition?.competitors?.find(
      (entry: any) => entry.homeAway === 'home',
    );
    assert(awayValue && homeValue, 'A scoreboard game is missing its teams.', 502);
    const gameStatus = status(event.status);
    const away = team(awayValue);
    const home = team(homeValue);
    let winnerId: string | null = null;
    if (gameStatus === 'final') {
      if (awayValue.winner === true) winnerId = away.id;
      if (homeValue.winner === true) winnerId = home.id;
    }
    return {
      id: String(event.id),
      away,
      home,
      startsAt: String(event.date),
      status: gameStatus,
      statusText: String(event.status?.type?.shortDetail ?? event.status?.type?.detail ?? ''),
      awayScore: number(awayValue.score),
      homeScore: number(homeValue.score),
      winnerId,
      venue: competition?.venue?.fullName ? String(competition.venue.fullName) : null,
      network: competition?.broadcasts?.[0]?.names?.[0]
        ? String(competition.broadcasts[0].names[0])
        : null,
    } satisfies Game;
  });
  assert(games.length > 0, 'No games were found for that season and week.', 502);
  return games.sort((a: Game, b: Game) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}
