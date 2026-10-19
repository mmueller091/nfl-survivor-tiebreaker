import fs from 'node:fs';

const NFL_WORKER_NAME = process.env.NFL_WORKER_NAME || 'nfl-survivor-tiebreaker';
const CLOUDFLARE_D1_DATABASE_ID =
  process.env.CLOUDFLARE_D1_DATABASE_ID || '227af770-8ac7-47a0-918a-37eea253e46f';
const SITE_URL =
  process.env.SITE_URL || 'https://nfl-survivor-tiebreaker.mmueller918.workers.dev';
if (!NFL_WORKER_NAME || !/^[a-z0-9-]+$/.test(NFL_WORKER_NAME))
  throw new Error('Set NFL_WORKER_NAME to a lowercase Worker name.');
if (!CLOUDFLARE_D1_DATABASE_ID)
  throw new Error('Set CLOUDFLARE_D1_DATABASE_ID to the database ID.');
if (!SITE_URL || !SITE_URL.startsWith('https://'))
  throw new Error('Set SITE_URL to the public HTTPS Worker URL.');

const file = 'dist/server/wrangler.json';
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
config.name = NFL_WORKER_NAME;
config.d1_databases = [{
  binding: 'DB',
  database_id: CLOUDFLARE_D1_DATABASE_ID,
  database_name: NFL_WORKER_NAME,
  migrations_dir: '../../drizzle',
}];
config.vars = { ...(config.vars || {}), SITE_URL };
delete config.route;
delete config.routes;
fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
console.log('Prepared Cloudflare Worker settings.');
