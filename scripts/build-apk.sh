#!/usr/bin/env bash
# Rakit ulang APK dengan aset web terbaru. Butuh: unzip, zip, zipalign, apksigner (Android build-tools), keytool.
# Pemakaian: scripts/build-apk.sh [base/app-release.apk]
# Env: KEYSTORE (default ./nimiyo.jks), KS_PASS (default "nimiyo123"), KS_ALIAS (default "nimiyo")
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$ROOT/base/app-release.apk}"
KS="${KEYSTORE:-$ROOT/nimiyo.jks}"; KS_PASS="${KS_PASS:-nimiyo123}"; KS_ALIAS="${KS_ALIAS:-nimiyo}"; export KS_PASS
W="$(mktemp -d)"; OUT="$ROOT/dist"; mkdir -p "$OUT"
unzip -q "$SRC" -d "$W/x"
rm -f "$W/x/META-INF/"*.RSA "$W/x/META-INF/"*.SF "$W/x/META-INF/"*.MF      # buang tanda tangan lama
cp "$ROOT/web/"{index.html,app.css,app.js,engine.js} "$W/x/assets/"
( cd "$W/x" && zip -q -r -X -9 "$W/unsigned.apk" . -x resources.arsc && zip -q -0 -X "$W/unsigned.apk" resources.arsc )  # resources.arsc wajib tanpa kompresi (Android 11+)
zipalign -f -p 4 "$W/unsigned.apk" "$W/aligned.apk"
[ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -alias "$KS_ALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$KS_PASS" -keypass "$KS_PASS" -dname "CN=Nimiyo"
apksigner sign --ks "$KS" --ks-key-alias "$KS_ALIAS" --ks-pass env:KS_PASS --key-pass env:KS_PASS --out "$OUT/nimiyo-nexora.apk" "$W/aligned.apk"
apksigner verify --verbose "$OUT/nimiyo-nexora.apk" | head -5
unzip -l "$OUT/nimiyo-nexora.apk" | grep -E "assets/(index.html|app.js|app.css|engine.js)"   # pastikan aset baru ikut
ls -lh "$OUT/nimiyo-nexora.apk"
