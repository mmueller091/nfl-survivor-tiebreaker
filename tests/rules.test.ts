import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyPool,
  gameLocked,
  PoolError,
  saveMemberPicks,
  standings,
  type Game,
} from '../lib/domain.ts';

const game: Game = {
  id: '1',
  away: { id: 'a', name: 'Away', abbreviation: 'AWY', logo: null },
  home: { id: 'h', name: 'Home', abbreviation: 'HME', logo: null },
  startsAt: '2026-10-22T20:15:00.000Z',
  status: 'scheduled',
  statusText: 'Thu 8:15 PM',
  awayScore: 0,
  homeScore: 0,
  winnerId: null,
  venue: null,
  network: null,
};

test('picks can change before kickoff and lock at kickoff', () => {
  const pool = emptyPool();
  pool.status = 'open';
  pool.members = [{ id: 'm', name: 'Member' }];
  pool.games = [game];
  const before = Date.parse(game.startsAt) - 1000;
  saveMemberPicks(pool, 'm', [{ gameId: '1', teamId: 'a' }], before);
  saveMemberPicks(pool, 'm', [{ gameId: '1', teamId: 'h' }], before);
  assert.equal(pool.picks[0].teamId, 'h');
  assert.equal(gameLocked(game, before), false);
  assert.throws(
    () => saveMemberPicks(pool, 'm', [{ gameId: '1', teamId: 'a' }], Date.parse(game.startsAt)),
    PoolError,
  );
});

test('final games produce straight-up records', () => {
  const pool = emptyPool();
  pool.members = [{ id: 'one', name: 'One' }, { id: 'two', name: 'Two' }];
  pool.games = [{ ...game, status: 'final', winnerId: 'h', homeScore: 24, awayScore: 20 }];
  pool.picks = [
    { memberId: 'one', gameId: '1', teamId: 'h', updatedAt: game.startsAt },
    { memberId: 'two', gameId: '1', teamId: 'a', updatedAt: game.startsAt },
  ];
  const rows = standings(pool);
  assert.equal(rows[0].member.id, 'one');
  assert.equal(rows[0].wins, 1);
  assert.equal(rows[1].losses, 1);
});
