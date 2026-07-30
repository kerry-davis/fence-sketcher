const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const MAX_SNAPSHOT_BYTES = 2_000_000;
const ALLOWED_EXPIRY = new Set([0, 7 * 86400, 30 * 86400]);

const securityHeaders = {
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow, noarchive',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...securityHeaders, 'content-type': 'application/json; charset=utf-8' },
  });
}

function safeEqual(a, b) {
  a = String(a || '');
  b = String(b || '');
  let different = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++)
    different |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return different === 0;
}

function authorised(request, env) {
  if (!env.SHARE_ADMIN_TOKEN || String(env.SHARE_ADMIN_TOKEN).length < 32) return false;
  return safeEqual(request.headers.get('authorization'), `Bearer ${env.SHARE_ADMIN_TOKEN}`);
}

async function requestJson(request) {
  const length = +(request.headers.get('content-length') || 0);
  if (length > MAX_SNAPSHOT_BYTES + 10_000) throw new Error('too large');
  const text = await request.text();
  if (text.length > MAX_SNAPSHOT_BYTES + 10_000) throw new Error('too large');
  try { return JSON.parse(text); } catch { throw new Error('bad json'); }
}

function cleanTitle(value) {
  const title = String(value || '').trim();
  if (!title || title.length > 64) throw new Error('bad title');
  return title;
}

function cleanExpiry(value) {
  const seconds = Number(value);
  if (!ALLOWED_EXPIRY.has(seconds)) throw new Error('bad expiry');
  return seconds;
}

function cleanSnapshot(source) {
  if (!source || source.v !== 2 || !['m', 'ft'].includes(source.unit) ||
      !Array.isArray(source.polys) || !Array.isArray(source.builds) ||
      !source.mat || typeof source.mat !== 'object')
    throw new Error('bad snapshot');
  const snapshot = {
    v: 2,
    unit: source.unit,
    polys: source.polys,
    builds: source.builds,
    mat: source.mat,
    view: source.view,
  };
  const text = JSON.stringify(snapshot);
  if (text.length > MAX_SNAPSHOT_BYTES) throw new Error('too large');
  return JSON.parse(text);
}

function newToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function shareUrl(request, env, token) {
  const origin = String(env.PUBLIC_ORIGIN || '').replace(/\/+$/, '') ||
                 new URL(request.url).origin;
  return `${origin}/share/${token}`;
}

async function putShare(env, token, record, expiresIn) {
  const options = expiresIn ? { expirationTtl: expiresIn } : {};
  await env.SHARES.put(`share:${token}`, JSON.stringify(record), options);
}

async function createShare(request, env) {
  let input;
  try { input = await requestJson(request); } catch (error) {
    return json({ err: error.message }, error.message === 'too large' ? 413 : 400);
  }
  let title, snapshot, expiresIn;
  try {
    title = cleanTitle(input.title);
    snapshot = cleanSnapshot(input.snapshot);
    expiresIn = cleanExpiry(input.expiresIn);
  } catch (error) { return json({ err: error.message }, 400); }

  let token;
  for (let tries = 0; tries < 3; tries++) {
    token = newToken();
    if (!await env.SHARES.get(`share:${token}`)) break;
  }
  const now = new Date(), expiresAt = expiresIn
    ? new Date(now.getTime() + expiresIn * 1000).toISOString() : null;
  const record = {
    version: 1, title, snapshot,
    createdAt: now.toISOString(), updatedAt: now.toISOString(), expiresAt,
  };
  await putShare(env, token, record, expiresIn);
  return json({ token, url: shareUrl(request, env, token), expiresAt });
}

async function updateShare(request, env, token) {
  const key = `share:${token}`, existing = await env.SHARES.get(key, 'json');
  if (!existing) return json({ err: 'not found' }, 404);
  let input;
  try { input = await requestJson(request); } catch (error) {
    return json({ err: error.message }, error.message === 'too large' ? 413 : 400);
  }
  let title, snapshot, expiresIn;
  try {
    title = cleanTitle(input.title);
    snapshot = cleanSnapshot(input.snapshot);
    expiresIn = cleanExpiry(input.expiresIn);
  } catch (error) { return json({ err: error.message }, 400); }

  const now = new Date(), expiresAt = expiresIn
    ? new Date(now.getTime() + expiresIn * 1000).toISOString() : null;
  const record = {
    ...existing, title, snapshot, updatedAt: now.toISOString(), expiresAt,
  };
  await putShare(env, token, record, expiresIn);
  return json({ token, url: shareUrl(request, env, token), expiresAt });
}

async function renameShare(request, env, token) {
  const key = `share:${token}`, existing = await env.SHARES.get(key, 'json');
  if (!existing) return json({ err: 'not found' }, 404);
  let input, title;
  try { input = await requestJson(request); title = cleanTitle(input.title); }
  catch (error) { return json({ err:error.message }, 400); }
  const record = {...existing, title, updatedAt:new Date().toISOString()};
  const options = existing.expiresAt
    ? {expiration:Math.floor(Date.parse(existing.expiresAt) / 1000)} : {};
  await env.SHARES.put(key, JSON.stringify(record), options);
  return json({ok:true});
}

async function getShare(env, token) {
  const record = await env.SHARES.get(`share:${token}`, 'json');
  if (!record || (record.expiresAt && Date.parse(record.expiresAt) <= Date.now()))
    return json({ err: 'unavailable' }, 404);
  return json({
    title: record.title,
    snapshot: record.snapshot,
    updatedAt: record.updatedAt,
    expiresAt: record.expiresAt,
  });
}

async function sharePage(request, env) {
  const assetUrl = new URL('/', request.url);
  const asset = await env.ASSETS.fetch(new Request(assetUrl, request));
  if (!asset.ok) return json({ err: 'viewer unavailable' }, 503);
  const headers = new Headers(asset.headers);
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  headers.set('content-security-policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
    "connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  return new Response(asset.body, { status: asset.status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const publicMatch = url.pathname.match(/^\/api\/shares\/([A-Za-z0-9_-]{43})$/);
    const pageMatch = url.pathname.match(/^\/share\/([A-Za-z0-9_-]{43})\/?$/);
    const adminMatch = url.pathname.match(/^\/api\/admin\/shares(?:\/([A-Za-z0-9_-]{43}))?$/);

    if (pageMatch && request.method === 'GET') return sharePage(request, env);
    if (publicMatch && request.method === 'GET') return getShare(env, publicMatch[1]);
    if (adminMatch) {
      if (!authorised(request, env)) return json({ err: 'not found' }, 404);
      if (!adminMatch[1] && request.method === 'POST') return createShare(request, env);
      if (adminMatch[1] && request.method === 'PUT')
        return updateShare(request, env, adminMatch[1]);
      if (adminMatch[1] && request.method === 'PATCH')
        return renameShare(request, env, adminMatch[1]);
      if (adminMatch[1] && request.method === 'DELETE') {
        await env.SHARES.delete(`share:${adminMatch[1]}`);
        return json({ ok: true });
      }
    }
    if ((pageMatch || publicMatch || adminMatch) && request.method !== 'GET')
      return json({ err: 'method not allowed' }, 405);
    return json({ err: 'not found' }, 404);
  },
};

export { TOKEN_RE, cleanSnapshot };
