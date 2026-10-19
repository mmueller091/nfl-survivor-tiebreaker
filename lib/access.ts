import { env } from 'cloudflare:workers';
import { assert, type Pool } from './domain';

const encoder = new TextEncoder();
function config() {
  return env as unknown as {
    SESSION_SECRET?: string;
    COMMISSIONER_KEY?: string;
  };
}
function sessionSecret() {
  const value = config().SESSION_SECRET;
  assert(value && value.length >= 24, 'The participant session secret is not configured.', 503);
  return value;
}
function commissionerKey() {
  const value = config().COMMISSIONER_KEY;
  assert(value && value.length >= 8, 'The commissioner key is not configured.', 503);
  return value;
}
async function cryptoKey() {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(sessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}
function hex(data: ArrayBuffer) {
  return Array.from(new Uint8Array(data), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export async function hash(value: string) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value.trim().toUpperCase())));
}
export async function commissionerMatches(value: string) {
  return (await hash(value)) === (await hash(commissionerKey()));
}
export function newCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => alphabet[byte % alphabet.length]).join('');
}
type Session = { role: 'admin' | 'member'; id?: string; fingerprint?: string; exp: number };
async function sign(payload: string) {
  return hex(await crypto.subtle.sign('HMAC', await cryptoKey(), encoder.encode(payload)));
}
export async function sessionCookie(
  request: Request,
  role: 'admin' | 'member',
  member?: { id: string; codeHash?: string },
) {
  const data: Session = {
    role,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    ...(member ? { id: member.id, fingerprint: member.codeHash } : {}),
  };
  const payload = btoa(JSON.stringify(data));
  const token = payload + '.' + (await sign(payload));
  return (
    'nfl_' + role + '=' + token + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800' +
    (new URL(request.url).protocol === 'https:' ? '; Secure' : '')
  );
}
export function clearCookie(request: Request, role: 'admin' | 'member') {
  return (
    'nfl_' + role + '=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' +
    (new URL(request.url).protocol === 'https:' ? '; Secure' : '')
  );
}
async function session(request: Request, role: 'admin' | 'member'): Promise<Session | null> {
  try {
    const token = (request.headers.get('cookie') ?? '')
      .split(';')
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith('nfl_' + role + '='))
      ?.split('=')
      .slice(1)
      .join('=');
    if (!token) return null;
    const [payload, signature] = token.split('.');
    if (!signature || !/^[a-f0-9]{64}$/.test(signature)) return null;
    const bytes = Uint8Array.from(signature.match(/../g)!, (value) => parseInt(value, 16));
    if (!(await crypto.subtle.verify('HMAC', await cryptoKey(), bytes, encoder.encode(payload)))) return null;
    const data = JSON.parse(atob(payload));
    return data.role === role && data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}
export async function access(request: Request, pool: Pool) {
  const [member, admin] = await Promise.all([session(request, 'member'), session(request, 'admin')]);
  return {
    admin: admin?.role === 'admin',
    memberId:
      pool.members.find(
        (candidate) => candidate.id === member?.id && candidate.codeHash === member?.fingerprint,
      )?.id ?? null,
  };
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  assert(!origin || origin === new URL(request.url).origin, 'This request must come from the pool website.', 403);
  assert(request.headers.get('content-type')?.includes('application/json'), 'Use a JSON request.', 415);
}
