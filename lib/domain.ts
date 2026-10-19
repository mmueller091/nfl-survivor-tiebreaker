export type PoolStatus = 'setup' | 'open' | 'closed' | 'complete';
export type GameStatus = 'scheduled' | 'in' | 'final' | 'postponed';

export type Team = {
  id: string;
  name: string;
  abbreviation: string;
  logo: string | null;
};

export type Game = {
  id: string;
  away: Team;
  home: Team;
  startsAt: string;
  status: GameStatus;
  statusText: string;
  awayScore: number | null;
  homeScore: number | null;
  winnerId: string | null;
  venue: string | null;
  network: string | null;
};

export type Member = { id: string; name: string; codeHash?: string };
export type Pick = {
  memberId: string;
  gameId: string;
  teamId: string;
  updatedAt: string;
};

export type Pool = {
  title: string;
  season: number;
  week: number;
  status: PoolStatus;
  members: Member[];
  games: Game[];
  picks: Pick[];
  scheduleUpdatedAt: string | null;
  scoresUpdatedAt: string | null;
  scoreError: string | null;
};

export class PoolError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function assert(
  condition: unknown,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new PoolError(message, status);
}

export function emptyPool(): Pool {
  return {
    title: 'Survivor Week 7 Tiebreaker',
    season: 2026,
    week: 7,
    status: 'setup',
    members: [],
    games: [],
    picks: [],
    scheduleUpdatedAt: null,
    scoresUpdatedAt: null,
    scoreError: null,
  };
}

export function gameLocked(game: Game, now = Date.now()) {
  return game.status !== 'scheduled' || Date.parse(game.startsAt) <= now;
}

export function gameRevealed(game: Game) {
  return game.status === 'in' || game.status === 'final';
}

export function saveMemberPicks(
  pool: Pool,
  memberId: string,
  entries: { gameId: string; teamId: string }[],
  now = Date.now(),
) {
  assert(pool.status === 'open', 'Picks are not open.', 409);
  assert(pool.members.some((member) => member.id === memberId), 'Participant not found.', 404);
  assert(Array.isArray(entries) && entries.length > 0, 'Choose at least one game.');
  const seen = new Set<string>();
  for (const entry of entries) {
    assert(!seen.has(entry.gameId), 'A game appears more than once.');
    seen.add(entry.gameId);
    const game = pool.games.find((candidate) => candidate.id === entry.gameId);
    assert(game, 'One of those games is not in this pool.');
    assert(!gameLocked(game, now), game.away.abbreviation + ' at ' + game.home.abbreviation + ' is locked.', 409);
    assert(
      entry.teamId === game.away.id || entry.teamId === game.home.id,
      'Choose one of the two teams in each game.',
    );
  }
  const updatedAt = new Date(now).toISOString();
  for (const entry of entries) {
    const existing = pool.picks.find(
      (pick) => pick.memberId === memberId && pick.gameId === entry.gameId,
    );
    if (existing) {
      existing.teamId = entry.teamId;
      existing.updatedAt = updatedAt;
    } else {
      pool.picks.push({ memberId, ...entry, updatedAt });
    }
  }
}

export type Standing = {
  member: Member;
  wins: number;
  losses: number;
  ties: number;
  liveCorrect: number;
  projectedWins: number;
  pending: number;
  rank: number;
};

export function standings(pool: Pool): Standing[] {
  const rows = pool.members.map((member) => {
    let wins = 0;
    let losses = 0;
    let ties = 0;
    let liveCorrect = 0;
    let pending = 0;
    for (const game of pool.games) {
      const pick = pool.picks.find(
        (candidate) => candidate.memberId === member.id && candidate.gameId === game.id,
      );
      if (game.status === 'final') {
        if (game.winnerId === null && pick) ties++;
        else if (pick?.teamId === game.winnerId) wins++;
        else losses++;
      } else {
        pending++;
        if (
          game.status === 'in' &&
          pick &&
          game.awayScore !== null &&
          game.homeScore !== null &&
          game.awayScore !== game.homeScore &&
          pick.teamId === (game.awayScore > game.homeScore ? game.away.id : game.home.id)
        )
          liveCorrect++;
      }
    }
    return {
      member,
      wins,
      losses,
      ties,
      liveCorrect,
      projectedWins: wins + liveCorrect,
      pending,
      rank: 0,
    };
  });
  rows.sort(
    (a, b) =>
      b.projectedWins - a.projectedWins ||
      b.wins - a.wins ||
      a.losses - b.losses ||
      a.member.name.localeCompare(b.member.name),
  );
  return rows.map((row, index) => ({
    ...row,
    rank:
      rows.findIndex(
        (candidate) =>
          candidate.projectedWins === row.projectedWins &&
          candidate.wins === row.wins &&
          candidate.losses === row.losses,
      ) + 1 ||
      index + 1,
  }));
}
