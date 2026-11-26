# Nimiyo × Nexora v2 — frontend + backend ringan

APK aslinya hanyalah cangkang WebView (±41 KB) yang memuat `index.html`, `app.css`, `app.js`, `engine.js`
dan jembatan native `NX`. Proyek ini mempertahankan arsitektur itu, jadi ukuran APK tetap kecil.

## Struktur
- `web/` — frontend (HTML + CSS + JS murni, tanpa framework/font/gambar eksternal, total ±100 KB)
- `server/` — backend OTA tanpa dependensi (Node ≥ 18)
- `scripts/build-bundle.js` — membuat bundle OTA dari `web/engine.js`
- `scripts/build-apk.sh` — memasang aset `web/` ke APK dan menandatanganinya

## Yang baru di frontend
Mini-player persisten (gaya YMusic) · kontrol layar kunci via Media Session · ikon SVG sprite (1 file, tanpa font ikon) ·
skeleton loading · glass-blur mati secara default (lebih ringan di HP lawas) · `content-visibility` pada daftar panjang ·
logika & ID elemen lama tetap utuh, `engine.js` tidak diubah.

## Backend
```bash
ADMIN_TOKEN=ganti-ini PORT=8787 node server/server.js
node scripts/build-bundle.js 2 "catatan perubahan"      # buat bundle OTA v2
```
| Endpoint | Fungsi |
|---|---|
| `GET /scrapers-version.json` | metadata OTA (hash SHA-256 dihitung server dari file asli) |
| `GET /bundle.js` | bundle scraper |
| `POST /admin/publish` | `Authorization: Bearer $ADMIN_TOKEN`, body `{bundle, changelog, minAppVersion?}`; cek syntax, versi harus naik, cadangan otomatis ke `public/history/` |
| `GET /api/health`, `/api/changelog` | status & riwayat rilis |

Di app: **Setelan → Update scraper → URL sumber** isi `https://domain-kamu` (wajib HTTPS; taruh di belakang Caddy/Nginx/Cloudflare).
Rate-limit 90 req/menit/IP, proteksi path traversal, perbandingan token timing-safe.

## Rakit APK
**Lewat GitHub (disarankan)** — push folder ini ke repo GitHub, lalu buka tab *Actions → Build APK → Run workflow*.
Hasilnya ada di *Artifacts* (`nimiyo-nexora-apk`); push tag `v1.0.0` untuk otomatis membuat Release.
APK dasar ada di `base/app-release.apk`; yang diganti hanya aset `web/`.

Agar APK bisa di-update menimpa versi sebelumnya, buat keystore sekali lalu simpan sebagai *Repository secrets*:
```bash
keytool -genkeypair -keystore nimiyo.jks -alias nimiyo -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 nimiyo.jks      # tempel ke secret KEYSTORE_B64
```
Secrets lain: `KEYSTORE_PASSWORD`, `KEY_ALIAS` (default `nimiyo`). Tanpa secrets, workflow memakai kunci sementara (harus copot-pasang tiap build).

**Lokal** (butuh Android build-tools): `scripts/build-apk.sh` -> `dist/nimiyo-nexora.apk`.
