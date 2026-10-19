'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Check,
  ChevronRight,
  CircleUserRound,
  Clock3,
  KeyRound,
  LockKeyhole,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Trophy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  emptyPool,
  gameLocked,
  gameRevealed,
  standings,
  type Game,
  type Pool,
} from '@/lib/domain';

type View = 'picks' | 'standings' | 'commissioner';
type Snapshot = {
  pool: Pool;
  revision: number;
  auth: { admin: boolean; memberId: string | null };
  serverTime: string;
};
type Code = { id: string; name: string; code: string };

async function read(url = '/api/pool') {
  const response = await fetch(url, { cache: 'no-store' });
  const data: any = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'The pool could not be loaded.');
  return data as Snapshot;
}

function stamp(value: string | null) {
  return value
    ? new Date(value).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Not updated yet';
}

function kickoff(value: string) {
  return new Date(value).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function saveFile(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PoolApp({ view }: { view: View }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <App view={view} />
    </QueryClientProvider>
  );
}

function App({ view }: { view: View }) {
  const client = useQueryClient();
  const query = useQuery<Snapshot>({
    queryKey: ['pool'],
    queryFn: () => read(),
    refetchInterval: 10000,
  });
  const snapshot = query.data;
  const pool = snapshot?.pool ?? emptyPool();
  const auth = snapshot?.auth ?? { admin: false, memberId: null };
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    if (view === 'commissioner') return;
    const run = () =>
      read('/api/pool?kind=scores')
        .then((data) => client.setQueryData(['pool'], data))
        .catch(() => {});
    run();
    const timer = setInterval(run, 30000);
    return () => clearInterval(timer);
  }, [client, view]);

  async function act(action: string, body: Record<string, unknown> = {}) {
    setPending(true);
    setNotice(null);
    try {
      const response = await fetch('/api/pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, revision: snapshot?.revision, ...body }),
      });
      const data: any = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'The action could not be completed.');
      await client.invalidateQueries({ queryKey: ['pool'] });
      return data;
    } catch (error) {
      setNotice({
        text: error instanceof Error ? error.message : 'The action could not be completed.',
        error: true,
      });
      throw error;
    } finally {
      setPending(false);
    }
  }

  const selectedMember = pool.members.find((member) => member.id === auth.memberId);
  return (
    <>
      <header className="site-header">
        <a className="brand" href="/">
          <span className="brand-mark">7</span>
          <span>
            Survivor <strong>Tiebreaker</strong>
          </span>
        </a>
        <span className="season-label">NFL · {pool.season}</span>
      </header>
      <nav className="site-nav" aria-label="Main navigation">
        <a href="/" className={view === 'picks' ? 'active' : ''}>
          <ShieldCheck size={17} /> My picks
        </a>
        <a href="/standings" className={view === 'standings' ? 'active' : ''}>
          <Trophy size={17} /> Live standings
        </a>
        {selectedMember && (
          <span className="signed-in">
            <CircleUserRound size={15} /> {selectedMember.name}
            <button onClick={() => void act('logout', { role: 'member' }).catch(() => {})} aria-label="Sign out">
              <LogOut size={14} />
            </button>
          </span>
        )}
      </nav>
      <main className="shell">
        <PageHeading view={view} pool={pool} />
        {query.error && (
          <div className="notice error" role="alert">
            The pool could not be refreshed. {query.error.message}
          </div>
        )}
        {notice && (
          <div className={'notice ' + (notice.error ? 'error' : 'success')} role={notice.error ? 'alert' : 'status'}>
            {notice.text}
          </div>
        )}
        {view === 'picks' && (
          <PicksView
            snapshot={snapshot}
            pending={pending}
            act={act}
            onNotice={setNotice}
          />
        )}
        {view === 'standings' && <StandingsView snapshot={snapshot} />}
        {view === 'commissioner' && (
          <CommissionerView snapshot={snapshot} pending={pending} act={act} onNotice={setNotice} />
        )}
      </main>
      <footer>
        <span>Week {pool.week} · straight-up winners</span>
        <span>Each pick unlocks at kickoff</span>
      </footer>
    </>
  );
}

function PageHeading({ view, pool }: { view: View; pool: Pool }) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">
          {pool.season} · NFL WEEK {pool.week}
        </p>
        <h1>{view === 'picks' ? 'Make your picks' : view === 'standings' ? 'Live standings' : 'Commissioner'}</h1>
        <p>
          {view === 'picks'
            ? 'Pick the winner of every game. You can change a pick until that game kicks off.'
            : view === 'standings'
              ? 'Records update as games finish. Picks appear when each game begins.'
              : 'Create the four entries, load the schedule and open the pool.'}
        </p>
      </div>
      <span className={'status status-' + pool.status}>
        <span /> {pool.status === 'open' ? 'Picks open' : pool.status === 'complete' ? 'Week complete' : pool.status}
      </span>
    </div>
  );
}

function LoginPanel({ pool, pending, act }: { pool: Pool; pending: boolean; act: (action: string, body?: Record<string, unknown>) => Promise<any> }) {
  const [memberId, setMemberId] = useState('');
  const [code, setCode] = useState('');
  return (
    <section className="login-panel panel">
      <div className="login-icon"><KeyRound size={24} /></div>
      <div>
        <p className="eyebrow">PRIVATE ENTRY</p>
        <h2>Select your name</h2>
        <p>Your access code opens only your picks. Other entries stay hidden until kickoff.</p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void act('login', { memberId, code }).catch(() => {});
        }}
      >
        <NativeSelect value={memberId} onChange={(event) => setMemberId(event.target.value)} required>
          <option value="">Choose your name</option>
          {pool.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
        </NativeSelect>
        <Input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Access code" autoComplete="one-time-code" required />
        <Button disabled={pending || !memberId || !code} type="submit">Open my picks <ChevronRight size={16} /></Button>
      </form>
    </section>
  );
}

function PicksView({
  snapshot,
  pending,
  act,
  onNotice,
}: {
  snapshot?: Snapshot;
  pending: boolean;
  act: (action: string, body?: Record<string, unknown>) => Promise<any>;
  onNotice: (notice: { text: string; error?: boolean } | null) => void;
}) {
  const pool = snapshot?.pool ?? emptyPool();
  const memberId = snapshot?.auth.memberId;
  const mine = useMemo(
    () => pool.picks.filter((pick) => pick.memberId === memberId),
    [pool.picks, memberId],
  );
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!memberId) return;
    setDraft((current) => {
      const next = { ...current };
      for (const pick of mine) next[pick.gameId] ??= pick.teamId;
      return next;
    });
  }, [memberId, mine]);

  if (!memberId) return <LoginPanel pool={pool} pending={pending} act={act} />;
  const now = snapshot ? Date.parse(snapshot.serverTime) : Date.now();
  const chosen = pool.games.filter((game) => draft[game.id]).length;
  const saved = mine.length;
  const changed = pool.games.filter((game) => {
    const stored = mine.find((pick) => pick.gameId === game.id)?.teamId;
    return draft[game.id] && draft[game.id] !== stored && !gameLocked(game, now);
  });
  return (
    <>
      <section className="entry-summary">
        <div><span>Selected</span><strong>{chosen} / {pool.games.length || 14}</strong></div>
        <div><span>Saved</span><strong>{saved} / {pool.games.length || 14}</strong></div>
        <div className="privacy-copy"><LockKeyhole size={17} /><span>Your choices remain private until each game starts.</span></div>
        <Button
          disabled={pending || changed.length === 0 || pool.status !== 'open'}
          onClick={() =>
            void act('savePicks', {
              picks: changed.map((game) => ({ gameId: game.id, teamId: draft[game.id] })),
            }).then(() => onNotice({ text: 'Your picks are saved.' })).catch(() => {})
          }
        >
          <Check size={16} /> Save {changed.length ? changed.length : ''} pick{changed.length === 1 ? '' : 's'}
        </Button>
      </section>
      {pool.status === 'setup' && <div className="empty-state panel">The commissioner is setting up Week {pool.week}.</div>}
      {pool.games.length > 0 && (
        <section className="games-grid" aria-label="Week games">
          {pool.games.map((game) => (
            <PickCard
              key={game.id}
              game={game}
              value={draft[game.id] ?? ''}
              locked={gameLocked(game, now) || pool.status !== 'open'}
              onChange={(teamId) => setDraft((current) => ({ ...current, [game.id]: teamId }))}
            />
          ))}
        </section>
      )}
    </>
  );
}

function PickCard({ game, value, locked, onChange }: { game: Game; value: string; locked: boolean; onChange: (teamId: string) => void }) {
  return (
    <article className={'game-card ' + (locked ? 'locked' : '')}>
      <div className="game-meta">
        <span>{game.status === 'scheduled' ? kickoff(game.startsAt) : game.statusText}</span>
        <span>{locked ? <><LockKeyhole size={12} /> Locked</> : <><Clock3 size={12} /> Open</>}</span>
      </div>
      <TeamChoice game={game} side="away" selected={value === game.away.id} disabled={locked} onChange={onChange} />
      <div className="at">AT</div>
      <TeamChoice game={game} side="home" selected={value === game.home.id} disabled={locked} onChange={onChange} />
      {game.network && <div className="game-foot">{game.network}{game.venue ? ' · ' + game.venue : ''}</div>}
    </article>
  );
}

function TeamChoice({ game, side, selected, disabled, onChange }: { game: Game; side: 'away' | 'home'; selected: boolean; disabled: boolean; onChange: (teamId: string) => void }) {
  const team = game[side];
  const score = side === 'away' ? game.awayScore : game.homeScore;
  return (
    <button className={'team-choice ' + (selected ? 'selected' : '')} disabled={disabled} onClick={() => onChange(team.id)}>
      {team.logo && <img src={team.logo} alt="" />}
      <span><strong>{team.name}</strong><small>{team.abbreviation}</small></span>
      {game.status !== 'scheduled' && score !== null ? <b>{score}</b> : <i>{selected ? <Check size={17} /> : null}</i>}
    </button>
  );
}

function StandingsView({ snapshot }: { snapshot?: Snapshot }) {
  const pool = snapshot?.pool ?? emptyPool();
  const rows = standings(pool);
  return (
    <>
      <section className="score-strip">
        <div><span>Leader</span><strong>{rows[0]?.member.name ?? '—'}</strong></div>
        <div><span>Projected wins</span><strong>{rows[0]?.projectedWins ?? 0}</strong></div>
        <div><span>Score update</span><strong className="small-value">{stamp(pool.scoresUpdatedAt)}</strong></div>
      </section>
      {pool.scoreError && <div className="notice error">{pool.scoreError} Last saved scores are still shown.</div>}
      <section className="standings-list panel">
        <div className="panel-heading"><div><p className="eyebrow">BEST RECORD WINS</p><h2>Standings</h2></div><span>Live leaders count toward projected wins</span></div>
        {rows.map((row) => (
          <div className={'standing-row ' + (row.rank === 1 ? 'leader' : '')} key={row.member.id}>
            <span className="rank">{row.rank}</span>
            <strong>{row.member.name}</strong>
            <div><span>Final</span><b>{row.wins}-{row.losses}{row.ties ? '-' + row.ties : ''}</b></div>
            <div><span>Live</span><b>+{row.liveCorrect}</b></div>
            <div><span>Projected</span><b>{row.projectedWins}</b></div>
          </div>
        ))}
      </section>
      <section className="panel scoreboard-panel">
        <div className="panel-heading"><div><p className="eyebrow">PICK REVEAL</p><h2>Game board</h2></div><span>Picks appear at each kickoff</span></div>
        {pool.games.map((game) => {
          const revealed = gameRevealed(game);
          return (
            <article className="score-game" key={game.id}>
              <div className="score-game-head">
                <div><strong>{game.away.abbreviation} {game.awayScore ?? ''}</strong><span>at</span><strong>{game.home.abbreviation} {game.homeScore ?? ''}</strong></div>
                <span className={'game-state ' + game.status}>{game.status === 'scheduled' ? kickoff(game.startsAt) : game.statusText}</span>
              </div>
              <div className="revealed-picks">
                {pool.members.map((member) => {
                  const pick = pool.picks.find((candidate) => candidate.memberId === member.id && candidate.gameId === game.id);
                  const own = member.id === snapshot?.auth.memberId;
                  const canSee = revealed || own || snapshot?.auth.admin;
                  const abbreviation = pick?.teamId === game.away.id ? game.away.abbreviation : pick?.teamId === game.home.id ? game.home.abbreviation : null;
                  const correct = game.status === 'final' && pick && pick.teamId === game.winnerId;
                  const wrong = game.status === 'final' && (!pick || (game.winnerId && pick.teamId !== game.winnerId));
                  return (
                    <div className={(correct ? 'correct' : wrong ? 'wrong' : '')} key={member.id}>
                      <span>{member.name}</span>
                      <strong>{canSee ? abbreviation ?? 'No pick' : <><LockKeyhole size={12} /> Hidden</>}</strong>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}

function CommissionerView({
  snapshot,
  pending,
  act,
  onNotice,
}: {
  snapshot?: Snapshot;
  pending: boolean;
  act: (action: string, body?: Record<string, unknown>) => Promise<any>;
  onNotice: (notice: { text: string; error?: boolean } | null) => void;
}) {
  const pool = snapshot?.pool ?? emptyPool();
  const [key, setKey] = useState('');
  const [title, setTitle] = useState(pool.title);
  const [season, setSeason] = useState(pool.season);
  const [week, setWeek] = useState(pool.week);
  const [members, setMembers] = useState(() =>
    Array.from({ length: 4 }, (_, index) => pool.members[index] ?? { id: '', name: '' }),
  );
  const [codes, setCodes] = useState<Code[]>([]);
  useEffect(() => {
    setTitle(pool.title);
    setSeason(pool.season);
    setWeek(pool.week);
    setMembers(Array.from({ length: 4 }, (_, index) => pool.members[index] ?? { id: '', name: '' }));
  }, [pool.title, pool.season, pool.week, pool.members]);

  if (!snapshot?.auth.admin)
    return (
      <section className="login-panel panel admin-login">
        <div className="login-icon"><KeyRound size={24} /></div>
        <div><p className="eyebrow">COMMISSIONER ONLY</p><h2>Enter the commissioner key</h2><p>Participant codes do not open this page.</p></div>
        <form onSubmit={(event) => { event.preventDefault(); void act('adminLogin', { key }).catch(() => {}); }}>
          <Input type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder="Commissioner key" required />
          <Button type="submit" disabled={pending || !key}>Open controls</Button>
        </form>
      </section>
    );

  const codeText = codes.map((code) => code.name + ': ' + code.code).join('\n');
  return (
    <div className="commissioner-stack">
      {codes.length > 0 && (
        <section className="codes-panel panel">
          <div className="panel-heading"><div><p className="eyebrow">SAVE THESE NOW</p><h2>New access codes</h2></div><Button variant="outline" onClick={() => saveFile('week-7-access-codes.txt', codeText)}>Download</Button></div>
          <div className="code-grid">{codes.map((code) => <div key={code.id}><span>{code.name}</span><strong>{code.code}</strong></div>)}</div>
        </section>
      )}
      <section className="panel setup-panel">
        <div className="panel-heading"><div><p className="eyebrow">STEP 1</p><h2>Pool and participants</h2></div><span>Exactly four entries</span></div>
        <div className="settings-grid">
          <label>Pool name<Input value={title} onChange={(event) => setTitle(event.target.value)} disabled={pool.status !== 'setup'} /></label>
          <label>Season<Input type="number" value={season} onChange={(event) => setSeason(Number(event.target.value))} disabled={pool.status !== 'setup'} /></label>
          <label>Week<Input type="number" min={1} max={18} value={week} onChange={(event) => setWeek(Number(event.target.value))} disabled={pool.status !== 'setup'} /></label>
        </div>
        <div className="member-fields">
          {members.map((member, index) => (
            <label key={member.id || index}>Player {index + 1}<Input value={member.name} onChange={(event) => setMembers((current) => current.map((entry, position) => position === index ? { ...entry, name: event.target.value } : entry))} disabled={pool.status !== 'setup'} /></label>
          ))}
        </div>
        <Button
          disabled={pending || pool.status !== 'setup' || members.some((member) => !member.name.trim())}
          onClick={() => void act('settings', { title, season, week, members }).then((data) => {
            setCodes(data.codes ?? []);
            onNotice({ text: 'Pool settings are saved.' });
          }).catch(() => {})}
        >Save four players</Button>
      </section>
      <section className="panel schedule-panel">
        <div className="panel-heading"><div><p className="eyebrow">STEP 2</p><h2>Week {pool.week} schedule</h2></div><span>{pool.games.length ? pool.games.length + ' games loaded' : 'Not loaded'}</span></div>
        <p>The schedule and kickoff times come from the live scoreboard. Review them before opening picks.</p>
        <Button disabled={pending || pool.status !== 'setup' || pool.members.length !== 4} onClick={() => void act('loadSchedule').then((data) => onNotice({ text: data.count + ' games loaded.' })).catch(() => {})}>
          <RefreshCw size={16} /> Load Week {pool.week}
        </Button>
        {pool.games.length > 0 && <div className="schedule-list">{pool.games.map((game) => <div key={game.id}><span>{kickoff(game.startsAt)}</span><strong>{game.away.abbreviation} at {game.home.abbreviation}</strong></div>)}</div>}
      </section>
      <section className="panel entry-control">
        <div className="panel-heading"><div><p className="eyebrow">STEP 3</p><h2>Entry controls</h2></div><span className={'status status-' + pool.status}>{pool.status}</span></div>
        {pool.status === 'setup' && <Button disabled={pending || pool.games.length === 0 || pool.members.length !== 4} onClick={() => void act('open').then(() => onNotice({ text: 'Picks are open.' })).catch(() => {})}>Open picks</Button>}
        {pool.status === 'open' && <Button variant="outline" disabled={pending} onClick={() => void act('close').then(() => onNotice({ text: 'Picks are closed.' })).catch(() => {})}>Close picks</Button>}
        {pool.status === 'closed' && <Button disabled={pending} onClick={() => void act('reopen').then(() => onNotice({ text: 'Picks are open again.' })).catch(() => {})}>Reopen picks</Button>}
        <div className="member-progress">
          {pool.members.map((member) => {
            const count = pool.picks.filter((pick) => pick.memberId === member.id).length;
            return <div key={member.id}><span><strong>{member.name}</strong><small>{count} / {pool.games.length || 14} picks saved</small></span><Button variant="outline" size="sm" onClick={() => void act('resetCode', { memberId: member.id }).then((data) => setCodes(data.codes ?? [])).catch(() => {})}>New code</Button></div>;
          })}
        </div>
      </section>
      <Button variant="ghost" onClick={() => void act('logout', { role: 'admin' }).catch(() => {})}><LogOut size={16} /> Sign out commissioner</Button>
    </div>
  );
}
