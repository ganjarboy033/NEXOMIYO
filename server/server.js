#!/usr/bin/env node
/* Nimiyo × Nexora — backend ringan (0 dependensi, Node >= 18)
   - OTA scraper : GET /scrapers-version.json , GET /bundle.js   (dipakai tombol "Cek & perbarui" di app)
   - Admin       : POST /admin/publish (Bearer ADMIN_TOKEN) — unggah bundle baru + validasi
   - Utilitas    : GET /api/health , GET /api/changelog
   - Statis      : melayani ../web untuk uji di browser */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), vm = require('vm');

const PORT = +process.env.PORT || 8787;
const TOKEN = process.env.ADMIN_TOKEN || '';
const PUB = path.join(__dirname, 'public');
const WEB = path.join(__dirname, '..', 'web');
const BUNDLE = path.join(PUB, 'bundle.js');
const META = path.join(PUB, 'meta.json');
const MAX_BODY = 1.5 * 1024 * 1024;
fs.mkdirSync(path.join(PUB, 'history'), { recursive: true });

/* ---------- state OTA ---------- */
let cache = { mtime: 0, hash: '', size: 0 };
const readMeta = () => { try { return JSON.parse(fs.readFileSync(META, 'utf8')); } catch (_) { return { scraperVersion: 0, minAppVersion: '1.0.0', changelog: '', history: [] }; } };
function bundleInfo() {            // hash selalu dihitung dari file asli → tidak mungkin tidak cocok
  let st; try { st = fs.statSync(BUNDLE); } catch (_) { return null; }
  if (st.mtimeMs !== cache.mtime) {
    const buf = fs.readFileSync(BUNDLE);
    cache = { mtime: st.mtimeMs, hash: crypto.createHash('sha256').update(buf).digest('hex'), size: buf.length };
  }
  return cache;
}
const verOf = src => { const m = /\bconst\s+SV\s*=\s*(\d+)/.exec(src); return m ? +m[1] : 0; };

/* ---------- util ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const send = (res, code, body, type = 'application/json; charset=utf-8', extra = {}) => {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, Object.assign({ 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Access-Control-Allow-Origin': '*' }, extra));
  res.end(data);
};
const hits = new Map();            // rate-limit sederhana per IP: 90 req/menit
setInterval(() => hits.clear(), 60000).unref();
const limited = ip => { const n = (hits.get(ip) || 0) + 1; hits.set(ip, n); return n > 90; };
const safeEq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function body(req) {
  return new Promise((ok, no) => {
    let n = 0; const c = [];
    req.on('data', d => { n += d.length; if (n > MAX_BODY) { no(Object.assign(new Error('Body terlalu besar'), { code: 413 })); req.destroy(); } else c.push(d); });
    req.on('end', () => ok(Buffer.concat(c).toString('utf8')));
    req.on('error', no);
  });
}

/* ---------- publish ---------- */
async function publish(req, res) {
  if (!TOKEN) return send(res, 503, { error: 'ADMIN_TOKEN belum diatur di server' });
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!safeEq(auth, TOKEN)) return send(res, 401, { error: 'Token salah' });
  let j; try { j = JSON.parse(await body(req)); } catch (e) { return send(res, e.code || 400, { error: e.message || 'JSON tidak valid' }); }
  const src = String(j.bundle || '');
  if (src.length < 2000) return send(res, 400, { error: 'Bundle terlalu kecil / kosong' });
  try { new vm.Script(src, { filename: 'bundle.js' }); } catch (e) { return send(res, 400, { error: 'Syntax error: ' + e.message }); }   // hanya parse, tidak dieksekusi
  if (!/(?:W|window)\.E\s*=/.test(src)) return send(res, 400, { error: 'Bundle harus mengisi window.E' });
  const v = verOf(src), meta = readMeta();
  if (!v) return send(res, 400, { error: 'Konstanta "const SV = <angka>" tidak ditemukan' });
  if (v <= meta.scraperVersion) return send(res, 409, { error: `Versi ${v} harus > versi aktif ${meta.scraperVersion}` });
  if (fs.existsSync(BUNDLE)) fs.copyFileSync(BUNDLE, path.join(PUB, 'history', `bundle-v${meta.scraperVersion}.js`));   // cadangan untuk rollback
  const tmp = BUNDLE + '.tmp'; fs.writeFileSync(tmp, src); fs.renameSync(tmp, BUNDLE);
  const entry = { v, changelog: String(j.changelog || '').slice(0, 500), ts: new Date().toISOString() };
  const next = { scraperVersion: v, minAppVersion: String(j.minAppVersion || meta.minAppVersion || '1.0.0'), changelog: entry.changelog, history: [entry].concat(meta.history || []).slice(0, 30) };
  fs.writeFileSync(META, JSON.stringify(next, null, 2));
  send(res, 200, { ok: true, scraperVersion: v, sourceHash: bundleInfo().hash });
}

/* ---------- router ---------- */
function serveStatic(req, res, p) {
  const rel = decodeURIComponent(p === '/' ? '/index.html' : p), file = path.normalize(path.join(WEB, rel));
  if (!file.startsWith(WEB + path.sep)) return send(res, 403, { error: 'Dilarang' });
  fs.readFile(file, (e, buf) => e ? send(res, 404, { error: 'Tidak ditemukan' }) : send(res, 200, buf, MIME[path.extname(file)] || 'application/octet-stream', { 'Cache-Control': 'no-cache' }));
}
http.createServer(async (req, res) => {
  const ip = req.socket.remoteAddress || '?';
  if (limited(ip)) return send(res, 429, { error: 'Terlalu banyak permintaan' }, undefined, { 'Retry-After': '60' });
  const p = new URL(req.url, 'http://x').pathname;
  try {
    if (req.method === 'OPTIONS') return send(res, 204, '', 'text/plain', { 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Authorization,Content-Type,Cache-Control' });
    if (req.method === 'GET' && p === '/scrapers-version.json') {
      const m = readMeta(), b = bundleInfo();
      if (!b) return send(res, 200, { scraperVersion: 0 }, undefined, { 'Cache-Control': 'no-store' });
      return send(res, 200, { scraperVersion: m.scraperVersion, minAppVersion: m.minAppVersion, sourceHash: b.hash, size: b.size, changelog: m.changelog }, undefined, { 'Cache-Control': 'no-store' });
    }
    if (req.method === 'GET' && p === '/bundle.js') {
      const b = bundleInfo(); if (!b) return send(res, 404, { error: 'Belum ada bundle' });
      return send(res, 200, fs.readFileSync(BUNDLE), MIME['.js'], { 'Cache-Control': 'no-store', ETag: '"' + b.hash + '"' });
    }
    if (req.method === 'GET' && p === '/api/health') return send(res, 200, { ok: true, uptime: Math.round(process.uptime()), scraperVersion: readMeta().scraperVersion });
    if (req.method === 'GET' && p === '/api/changelog') return send(res, 200, readMeta().history || []);
    if (req.method === 'POST' && p === '/admin/publish') return publish(req, res);
    if (req.method === 'GET') return serveStatic(req, res, p);
    send(res, 405, { error: 'Metode tidak didukung' });
  } catch (e) { send(res, 500, { error: 'Kesalahan server' }); }
}).listen(PORT, () => console.log(`Nimiyo server → http://localhost:${PORT}  (admin ${TOKEN ? 'aktif' : 'NONAKTIF — set ADMIN_TOKEN'})`));
