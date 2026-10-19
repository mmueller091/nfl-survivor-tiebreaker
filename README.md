# NFL Survivor Week 7 Tiebreaker

A private-entry straight-up NFL pick'em for four survivor-pool finalists.

## Rules

- Each participant picks the winner of every Week 7 game.
- A pick can be changed until that game's scheduled kickoff.
- Other participants' picks remain hidden until that game starts.
- Final games count as wins or losses. An NFL tie counts as a tie for every submitted pick.
- A missed pick counts as a loss after the game is final.
- Live leaders appear as projected wins; official standings use final games.
- Equal records share the same rank.

## Access

- `/` lets a participant select their name, enter their personal code and make picks.
- `/standings` shows live scores, records and picks after kickoff.
- `/commissioner` requires the private commissioner key. It creates the four participants, generates personal codes, loads the schedule and opens entries.

Personal codes are stored only as hashes. Session and commissioner secrets belong in the hosting service, never in GitHub.

## Data

The schedule and live scores come from ESPN's public scoreboard feed. The app refreshes at most once every 30 seconds while a participant or standings page is open. If the feed fails, the last saved scores remain visible.

## Local setup

1. Run `npm ci`.
2. Copy `.env.example` to `.dev.vars` and replace both secrets.
3. Run `npm run dev`.

## Checks

- `npm run typecheck`
- `npm test`
- `npm run build`

The included deployment workflow targets Cloudflare Workers with D1 while GitHub stores the source.
