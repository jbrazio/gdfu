# Scripts

Run the examples from the repository root unless stated otherwise. Replace example paths and IDs with real values. Commands that generate assets overwrite their existing output files.

## Requirements

Install the project dependencies with `npm ci` before running app builds or TypeScript scripts. Use Node.js 22, as CI does. `screenshots/drive.mjs` needs its global `fetch` and `WebSocket` support.

Python scripts use Python 3. Most require only the standard library. Artwork requires Pillow; feature-graphic generation also requires fonttools. Store uploads use fastlane (`bundle exec fastlane`).

For Debian/Ubuntu system Python:

```sh
sudo apt-get install python3-pil python3-fonttools \
  fonts-dejavu-core fonts-wqy-zenhei
```

Alternatively, install Python dependencies in a virtual environment:

```sh
python3 -m venv .venv
. .venv/bin/activate
python3 -m pip install Pillow fonttools
```

Creating the environment may require the distribution's `python3-venv` package. Screenshot capture additionally needs Playwright and a Chromium installation. Video editing needs `ffmpeg`. Android builds need the Android SDK and a compatible JDK. Credential uploads need an authenticated GitHub CLI, `gh`.

## Release notes

### `release-notes.py`

Generate release notes from the `[Unreleased]` section of the changelog, and move shipped entries into a version section after promotion. CI runs both. Requires Python's standard library only.

It writes the changelog text to `<output>/github.md`. The fixed store notes in eight languages go to `<output>/android/<locale>/changelogs/default.txt` and `<output>/ios.json`. `cut` moves the entries present in the promoted build's changelog into `## [VERSION] - DATE`; entries merged later stay under `[Unreleased]`.

```sh
python3 scripts/release-notes.py CHANGELOG.md /tmp/gdfu-release-notes
python3 scripts/release-notes.py cut CHANGELOG.md 2026.11.142 2026-11-23 /tmp/tagged-CHANGELOG.md
python3 scripts/release-notes.py --selftest
```

## Release credentials

Do not commit credential files. These helpers store local secret files under the ignored `.secrets/` directory with restricted permissions. `--push` uploads secrets to GitHub and replaces existing values with the same names.

### `setup-android-secrets.py`

Prepare Android signing credentials and optionally validate a Google Play service-account key. Run for initial Android release setup or deliberate credential replacement, not before every build.

Requires Python's standard library and JDK `keytool` when generating a keystore. Add an authenticated `gh` installation for `--push`.

```sh
python3 scripts/setup-android-secrets.py
python3 scripts/setup-android-secrets.py --service-account /path/to/key.json
python3 scripts/setup-android-secrets.py --push
python3 scripts/setup-android-secrets.py --service-account /path/to/key.json --push --repo owner/repo
```

- No arguments: create an upload keystore and signing secret files in `.secrets/android/`. An existing keystore is retained.
- `--service-account PATH`: validate the JSON key and save `PLAY_SERVICE_ACCOUNT_JSON` locally. A keystore is also generated if missing.
- `--push`: upload the local secret files using `gh secret set`.
- `--repo OWNER/REPO`: select the destination repository; otherwise `gh` uses the current repository.

Keep a separate backup of the upload keystore and passwords. The script does not create the Play app, enable its API or grant service-account permissions.

iOS signing uses fastlane `match`.

## Store listings

Both stores' listings live in fastlane's default layout and are published by Actions → **Store listing** (`fastlane android listing` and `fastlane ios listing`):

- `fastlane/metadata/android/<locale>/`: Play `title.txt` (30 characters), `short_description.txt` (80), `full_description.txt` (4000), `images/phoneScreenshots/`, `images/featureGraphic.png` and `images/icon.png` (a link to the shared `fastlane/metadata/android/icon.png`).
- `fastlane/metadata/<Apple locale>/`: App Store `subtitle.txt` (30), `keywords.txt` (100) and `support_url.txt`. `name.txt` and `description.txt` link to the Play title and full description, so each text exists once.
- `fastlane/screenshots/<Apple locale>/`: App Store screenshots. fastlane picks the device type from the image size.

Play and Apple name two locales differently: `zh-CN` is `zh-Hans` and `ko-KR` is `ko`.

## Tutorial and store artwork

### `tutorial-art.py`

Generate the language-neutral, low-poly SVG illustrations for the tutorial setup slides in `public/tutorial/00-*.svg`. Run after changing the illustrations in this script.

Requires Python's standard library only. Accepts no arguments and overwrites the generated SVGs.

```sh
python3 scripts/tutorial-art.py
```

### `screenshots/capture.mjs`

Capture the app's update flow in all eight languages at three sizes (Play phone, iPhone 6.9" and iPad 13"), plus the tutorial close-ups, using fake BLE and release data. Run after UI or translation changes that affect screenshots. No physical proxy or target is needed.

Requires installed project dependencies, a built static app in `out/`, Playwright, Chromium and a valid firmware ZIP accepted by the app.

```sh
npm run build
node scripts/screenshots/capture.mjs /absolute/path/to/firmware.zip /tmp/gdfu-screenshots
```

- First argument: required firmware ZIP path.
- Second argument: output directory, default `/tmp/gdfu-screenshots`.
- `PLAYWRIGHT`: optional import specifier or absolute path to Playwright's module if `playwright` is not resolvable.
- `CHROMIUM`: optional browser executable path.

Starts a temporary local web server and headless browser. Writes raw PNGs for `frame.py`; it does not upload store assets.

### `screenshots/frame.py`

Turn raw captures into captioned store screenshots and tutorial WebP close-ups. Run after `capture.mjs`. Play gets 1080 × 1920, the App Store gets iPhone 1320 × 2868 and iPad 2064 × 2752.

Requires Pillow, DejaVu Sans Bold and WenQuanYi Zen Hei. The optional argument selects the capture directory, default `/tmp/gdfu-screenshots`. `FONT` and `CJK_FONT` override the font paths.

```sh
python3 scripts/screenshots/frame.py /tmp/gdfu-screenshots
```

Overwrites `store/android/graphics/<locale>/phone/*.png`, `store/ios/screenshots/<locale>/*.png` and `public/tutorial/<locale>/*.webp`. To publish both stores, merge, then run Actions → **Store listing**.

### `screenshots/feature-graphics.py`

Generate 1024 × 500 RGB feature graphics for all eight Play languages using the shared app-icon logo. Run after changing the promotional copy or branding. It also writes the App Store universal creative asset, `fastlane/creative/<Apple locale>/universal.png` at 5244 × 2950. The artwork stays inside Apple's 1402 × 962 safe area, so the product page header and search results crops both keep it. fastlane can't upload creative assets: upload them by hand in App Store Connect → Product Page → Creative assets.

Requires Pillow, fonttools, DejaVu Sans regular/bold and WenQuanYi Zen Hei. Accepts no arguments. `FONT`, `BOLD_FONT` and `CJK_FONT` override the font paths. Missing glyphs or text that cannot fit cause an error.

```sh
python3 scripts/screenshots/feature-graphics.py
```

Overwrites `store/android/graphics/<locale>/feature-graphic.png`. Does not upload the results.

## Promotional video

### `screenshots/record-video.sh`

Build and install a demo app on an Android emulator, record the update flow with fake data and produce the English promotional video. Run only when deliberately regenerating the video on a disposable emulator.

**This clears all app data for `pt.meshcore.gdfu` on the selected emulator and replaces its installed app with a debug build.** It temporarily injects demo assets into the build output and attempts to rebuild clean app assets on exit. The installed emulator app remains the demo build until replaced.

Requires Bash, Node.js with global `WebSocket`, project dependencies, a booted emulator, Android SDK tools including `adb`, a compatible JDK, Gradle build access, Python/Pillow, DejaVu fonts and `ffmpeg` with the filters used by `edit-video.py`. This legacy script drives the emulator directly with `adb`; device-tool workflows should not invoke it unchanged where device-panel control is required.

```sh
bash scripts/screenshots/record-video.sh /absolute/path/to/firmware.zip emulator-5554
```

- First argument: required firmware ZIP path. Use an absolute path because the script changes directories.
- Second argument: `adb` serial, default `emulator-5554`. Discover the intended emulator before running.
- `WORK`: intermediate directory, default `/tmp/gdfu-video`.
- `FONTS`: optional font directory passed to the video editor.

Overwrites the recording intermediates and `store/android/graphics/en-GB/video/gdfu-promo-en-GB.mp4`. It also uses local port 9333 for WebView debugging.

### `screenshots/drive.mjs`

Drive the foreground demo WebView through the update flow over Chrome DevTools Protocol and save step timestamps for video editing. Normally called by `record-video.sh`; run separately only with a prepared demo app and debugging endpoint.

Requires Node.js with global `fetch` and `WebSocket`, a reachable DevTools HTTP endpoint and a foreground demo WebView. Both arguments are required.

```sh
node scripts/screenshots/drive.mjs http://127.0.0.1:9333 /tmp/gdfu-video/marks.json
```

The first argument is the DevTools URL; the second is the output JSON path. This operates the app and overwrites the timestamp file.

### `screenshots/edit-video.py`

Edit a raw recording using the step timestamps, captions and branded intro/outro. Run after recording, or to re-edit an existing take without using an emulator.

Requires Python, Pillow, `ffmpeg` and DejaVu fonts. `FONTS` overrides the font directory, default `/usr/share/fonts/truetype/dejavu`. All three positional arguments are required.

```sh
python3 scripts/screenshots/edit-video.py \
  /tmp/gdfu-video/raw.mp4 \
  /tmp/gdfu-video/marks.json \
  /tmp/gdfu-promo.mp4
```

Arguments are the raw MP4, timestamp JSON from `drive.mjs` and destination MP4. Produces a 1920 × 1080 video and overwrites the destination.

### `screenshots/fake-proxy.js`

Browser-injected fixture for screenshot capture and demo recording. Simulates proxy/BLE interactions and release data so the update flow can be shown without hardware. It is loaded by `capture.mjs` and the demo recording build, not executed as a standalone CLI.

Requires the app's browser/WebView environment. Accepts no command-line arguments. Do not include it in production builds; it replaces real device behaviour with fake data.

## Firmware fixture check

### `verify-firmware-fixture.ts`

Exercise the production firmware ZIP parser against a fixed package and assert its decoded size, device type, SoftDevice requirement, CRC and init data. Run when checking parser compatibility with that fixture. The script's header also identifies it as a helper for `tests/test_firmware_parser_fixture.py`.

Requires installed project dependencies, `tsx` and the exact fixture at `../firmware/Heltec_t114_repeater-2026.9.2-lusofw-6ad664c.zip`, relative to the repository root. This fixture is outside the application repository; supply it before running the check.

```sh
npx tsx scripts/verify-firmware-fixture.ts
```

Accepts no arguments. Prints `fixture ok` on success; fails on a missing file, parse error or metadata mismatch. Does not modify the firmware.
