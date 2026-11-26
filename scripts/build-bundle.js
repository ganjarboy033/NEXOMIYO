#!/usr/bin/env node
/* Bangun bundle OTA dari web/engine.js:  node scripts/build-bundle.js <versi> "catatan perubahan"
   Hasil: server/public/bundle.js + meta.json (hash dihitung ulang oleh server). */
'use strict';
const fs = require('fs'), path = require('path');
const v = parseInt(process.argv[2], 10), log = process.argv[3] || '';
if (!v) { console.error('Pemakaian: node scripts/build-bundle.js <versi-integer> "changelog"'); process.exit(1); }
const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'engine.js'), 'utf8');
if (!/\bconst SV = \d+;/.test(src)) { console.error('const SV tidak ditemukan di engine.js'); process.exit(1); }
const out = src.replace(/\bconst SV = \d+;/, `const SV = ${v};`);
const pub = path.join(__dirname, '..', 'server', 'public');
fs.mkdirSync(pub, { recursive: true });
fs.writeFileSync(path.join(pub, 'bundle.js'), out);
const mp = path.join(pub, 'meta.json'); let m = {}; try { m = JSON.parse(fs.readFileSync(mp, 'utf8')); } catch (_) {}
const h = [{ v, changelog: log, ts: new Date().toISOString() }].concat(m.history || []).slice(0, 30);
fs.writeFileSync(mp, JSON.stringify({ scraperVersion: v, minAppVersion: m.minAppVersion || '1.0.0', changelog: log, history: h }, null, 2));
console.log('OK bundle v' + v, '(' + out.length + ' byte)');
