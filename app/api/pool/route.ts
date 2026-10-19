import {
  access,
  clearCookie,
  commissionerMatches,
  hash,
  newCode,
  sameOrigin,
  sessionCookie,
} from '@/lib/access';
import {
  assert,
  gameRevealed,
  PoolError,
  saveMemberPicks,
  type Pool,
} from '@/lib/domain';
import { fetchWeek } from '@/lib/nfl';
import { claimRefresh, loginLimit, readPool, savePool } from '@/lib/store';

export const dynamic = 'force-dynamic';

function json(data: unknown, status = 200, cookie?: string) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...(cookie ? { 'Set-Cookie': cookie } : {}),
    },
  });
}

function failure(error: unknown) {
  return json(
    {
      error:
        error instanceof Error
          ? error.message
          : 'The request could not be completed.',
    },
    error instanceof PoolError ? error.status : 502,
  );
}

function requiredText(value: unknown, max = 60) {
  assert(
    typeof value === 'string' &&
      value.trim().length > 0 &&
      value.trim().length <= max,
    'Enter a value between 1 and ' + max + ' characters.',
  );
  return value.trim();
}

function integer(value: unknown, min: number, max: number, label: string) {
  const parsed = Number(value);
  assert(
    Number.isInteger(parsed) && parsed >= min && parsed <= max,
    'Choose a valid ' + label + '.',
  );
  return parsed;
}

function publicPool(
  pool: Pool,
  auth: { admin: boolean; memberId: string | null },
) {
  const started = new Set(
    pool.games.filter(gameRevealed).map((game) => game.id),
  );
  return {
    ...pool,
    members: pool.members.map(({ codeHash, ...member }) => member),
    picks: pool.picks.filter(
      (pick) =>
        auth.admin ||
        pick.memberId === auth.memberId ||
        started.has(pick.gameId),
    ),
  };
}

async function refreshScores() {
  const initial = await readPool();
  if (!initial.pool.games.length) return;
  if (
    initial.pool.scoresUpdatedAt &&
    Date.now() - Date.parse(initial.pool.scoresUpdatedAt) < 30000
  )
    return;
  if (
    !(await claimRefresh(
      'scores-' + initial.pool.season + '-' + initial.pool.week,
      30,
    ))
  )
    return;
  const season = initial.pool.season;
  const week = initial.pool.week;
  let games = null;
  let error: string | null = null;
  try {
    games = await fetchWeek(season, week);
  } catch (caught) {
    error =
      caught instanceof Error
        ? caught.message
        : 'Live NFL scores could not be refreshed.';
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await readPool();
    if (current.pool.season !== season || current.pool.week !== week) return;
    if (games) {
      const byId = new Map(games.map((game) => [game.id, game]));
      current.pool.games = current.pool.games.map(
        (game) => byId.get(game.id) ?? game,
      );
      current.pool.scoresUpdatedAt = new Date().toISOString();
      if (
        current.pool.games.length &&
        current.pool.games.every((game) => game.status === 'final')
      )
        current.pool.status = 'complete';
    }
    current.pool.scoreError = error;
    try {
      await savePool(current.pool, current.revision);
      return;
    } catch (caught) {
      if (!(caught instanceof PoolError && caught.status === 409)) throw caught;
    }
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('kind') === 'scores') await refreshScores();
    const { pool, revision } = await readPool();
    const auth = await access(request, pool);
    return json({
      pool: publicPool(pool, auth),
      revision,
      auth,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    assert(
      Number(request.headers.get('content-length') ?? 0) < 100000,
      'The request is too large.',
      413,
    );
    const body: any = await request.json();
    const { pool, revision } = await readPool();
    const auth = await access(request, pool);
    const ip = request.headers.get('cf-connecting-ip') ?? 'local';

    if (body.action === 'login') {
      await loginLimit(
        'member-' + (await hash(ip + '-' + String(body.memberId ?? ''))),
      );
      const code = requiredText(body.code, 200);
      const member = pool.members.find(
        (candidate) => candidate.id === body.memberId,
      );
      assert(
        member && member.codeHash === (await hash(code)),
        'The name or access code is incorrect.',
        401,
      );
      return json(
        { ok: true },
        200,
        await sessionCookie(request, 'member', member),
      );
    }

    if (body.action === 'adminLogin') {
      await loginLimit('admin-' + (await hash(ip)));
      const key = requiredText(body.key, 200);
      assert(
        await commissionerMatches(key),
        'The commissioner key is incorrect.',
        401,
      );
      return json({ ok: true }, 200, await sessionCookie(request, 'admin'));
    }

    if (body.action === 'logout') {
      const role = body.role === 'admin' ? 'admin' : 'member';
      return json({ ok: true }, 200, clearCookie(request, role));
    }

    if (body.action === 'savePicks') {
      assert(auth.memberId, 'Sign in before saving picks.', 401);
      assert(Array.isArray(body.picks), 'Choose your picks.');
      saveMemberPicks(
        pool,
        auth.memberId,
        body.picks.map((pick: any) => ({
          gameId: String(pick.gameId),
          teamId: String(pick.teamId),
        })),
      );
      await savePool(pool, revision);
      return json({ ok: true });
    }

    assert(auth.admin, 'Commissioner access required.', 401);

    if (body.action === 'settings') {
      assert(
        pool.status === 'setup' && pool.picks.length === 0,
        'Setup is locked after entries open.',
        409,
      );
      pool.title = requiredText(body.title, 70);
      pool.season = integer(
        body.season,
        2020,
        new Date().getUTCFullYear() + 1,
        'season',
      );
      pool.week = integer(body.week, 1, 18, 'week');
      assert(
        Array.isArray(body.members) && body.members.length === 4,
        'Enter exactly four participant names.',
      );
      const previousMembers = pool.members;
      const names = new Set<string>();
      const ids = new Set<string>();
      const codes: { id: string; name: string; code: string }[] = [];
      pool.members = [];
      for (const entry of body.members) {
        const name = requiredText(entry.name, 40);
        assert(
          !names.has(name.toLowerCase()),
          'Participant names must be unique.',
        );
        names.add(name.toLowerCase());
        const old = previousMembers.find((member) => member.id === entry.id);
        const id = old?.id ?? crypto.randomUUID();
        assert(!ids.has(id), 'A participant appears twice.');
        ids.add(id);
        let codeHash = old?.codeHash;
        if (!codeHash) {
          const code = newCode();
          codeHash = await hash(code);
          codes.push({ id, name, code });
        }
        pool.members.push({ id, name, codeHash });
      }
      await savePool(pool, revision);
      return json({ ok: true, codes });
    }

    if (body.action === 'loadSchedule') {
      assert(
        pool.status === 'setup' && pool.picks.length === 0,
        'The schedule is locked after entries open.',
        409,
      );
      pool.games = await fetchWeek(pool.season, pool.week);
      pool.scheduleUpdatedAt = new Date().toISOString();
      pool.scoresUpdatedAt = pool.scheduleUpdatedAt;
      pool.scoreError = null;
      await savePool(pool, revision);
      return json({ ok: true, count: pool.games.length });
    }

    if (body.action === 'resetCode') {
      const member = pool.members.find(
        (candidate) => candidate.id === body.memberId,
      );
      assert(member, 'Participant not found.', 404);
      const code = newCode();
      member.codeHash = await hash(code);
      await savePool(pool, revision);
      return json({
        ok: true,
        codes: [{ id: member.id, name: member.name, code }],
      });
    }

    if (body.action === 'resetAllCodes') {
      assert(pool.members.length === 4, 'Save four participants first.');
      const codes = [];
      for (const member of pool.members) {
        const code = newCode();
        member.codeHash = await hash(code);
        codes.push({ id: member.id, name: member.name, code });
      }
      await savePool(pool, revision);
      return json({ ok: true, codes });
    }

    assert(
      Number(body.revision) === revision,
      'The pool changed. Refresh and try again.',
      409,
    );
    if (body.action === 'open') {
      assert(pool.members.length === 4, 'Save four participants first.');
      assert(
        pool.games.length > 0,
        'Load the Week ' + pool.week + ' schedule first.',
      );
      pool.status = 'open';
    } else if (body.action === 'close') {
      assert(pool.status === 'open', 'Entries are not open.', 409);
      pool.status = 'closed';
    } else if (body.action === 'reopen') {
      assert(pool.status === 'closed', 'Entries are not closed.', 409);
      pool.status = 'open';
    } else {
      throw new PoolError('Unknown action.');
    }
    await savePool(pool, revision);
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
