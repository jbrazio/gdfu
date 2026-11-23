#!/usr/bin/env bash
# Records the app on an Android emulator walking through connect → target → firmware → update,
# against scripts/screenshots/fake-proxy.js, then frames it into the Play promo video.
# Usage: scripts/screenshots/record-video.sh <firmware.zip> [adb serial]
# Needs: a booted emulator, adb, Android SDK/JDK for gradle, ffmpeg with drawtext, DejaVu fonts.
set -euo pipefail
zip=${1:?usage: record-video.sh <firmware.zip> [adb serial]}
serial=${2:-emulator-5554}
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
work=${WORK:-/tmp/gdfu-video}
adb() { command adb -s "$serial" "$@"; }
mkdir -p "$work"
# Never leave the fake proxy in out/ or the Android assets: rebuild clean on exit, even on failure.
trap 'cd "$repo" && npm run build >/dev/null && npx cap sync android >/dev/null' EXIT

# 1. Demo build: real app + fake proxy script + firmware served same-origin.
cd "$repo"
npm run build >/dev/null
mkdir -p out/demo
cp "$zip" out/demo/firmware.zip
cp "$here/fake-proxy.js" out/demo/fake-proxy.js
# Load before the app bundle so the fake is in place before React hydrates.
sed -i 's#<head>#<head><script src="/demo/fake-proxy.js"></script>#' out/index.html
npx cap sync android >/dev/null
(cd android && ./gradlew -q assembleDebug)
adb install -r android/app/build/outputs/apk/debug/app-debug.apk >/dev/null
# Clean slate each take: no saved firmware, tutorial already seen (the fake sets it).
adb shell pm clear pt.meshcore.gdfu >/dev/null
adb shell pm grant pt.meshcore.gdfu android.permission.BLUETOOTH_SCAN
adb shell pm grant pt.meshcore.gdfu android.permission.BLUETOOTH_CONNECT
# 2. Record while driving the UI through the WebView (Chrome DevTools protocol over adb).
adb shell am start -W -n pt.meshcore.gdfu/.MainActivity >/dev/null
sleep 3
pid=$(adb shell pidof pt.meshcore.gdfu | tr -d '\r')
adb forward tcp:9333 "localabstract:webview_devtools_remote_$pid" >/dev/null
adb shell rm -f /sdcard/gdfu-demo.mp4
adb shell screenrecord --bit-rate 12000000 --time-limit 170 /sdcard/gdfu-demo.mp4 &
rec=$!
sleep 1
node "$here/drive.mjs" http://127.0.0.1:9333 "$work/marks.json"
sleep 1
adb shell pkill -INT screenrecord || true
wait "$rec" || true
sleep 2
adb pull /sdcard/gdfu-demo.mp4 "$work/raw.mp4" >/dev/null
adb forward --remove tcp:9333 || true

# 3. Edit: captions per step, brand intro/outro, 1920x1080.
python3 "$here/edit-video.py" "$work/raw.mp4" "$work/marks.json" "$repo/fastlane/video/gdfu-promo-en-GB.mp4"
