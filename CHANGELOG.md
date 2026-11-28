# Changelog

All notable changes to this project are documented in this file. Format inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow CalVer `YYYY.M.N`, where `N` is the build number.

## [Unreleased]

### Added

- The tutorial can be opened again from the About dialog.
- Firmware ZIPs are accepted whatever `.dat` and `.bin` file names their `manifest.json` gives, so ZephCore and other renamed packages can be imported and flashed.
- The screen stays on during an update, so the phone no longer locks or sleeps mid-flash.

## [2026.11.40] - 2026-11-24

### Added

- Available in eight languages: English (British), Portuguese (European and Brazilian), Chinese (Simplified), French, German, Korean and Spanish, selected automatically from the device language.
- First-run tutorial covering the full setup: how the phone, proxy and repeater work together, flashing the proxy, installing the repeater bootloader, then connecting, selecting a target, downloading firmware and updating.
- Signal strength for both links in the header: BLE to the proxy and FSK to the target, both updated live during an update.
- About dialog with the app version, credits and open-source licences.
- The app version is shown at the bottom of the main screen.
- Privacy policy: no account, no ads, no analytics, no personal data collected.

### Changed

- Refreshed the tutorial setup illustrations and reduced the Android app size with code and resource shrinking.
- Firmware updates on iPhone stream data packets back-to-back, keeping the proxy buffer full instead of slowing down and failing mid-update.
- Bluetooth signal strength refreshes every 10 seconds during firmware updates on iOS and Android, instead of every second.
- Redesigned interface with numbered cards (1–4) that follow the update flow and a new colour scheme in light and dark mode.
- Update card: a checklist shows when the proxy, target and firmware are ready. During an update it shows a percentage, the time left and a reminder to keep the phone near the proxy, then a validating message while the device checks the new firmware and restarts.
- Firmware card: saved firmware is listed first, showing board, version, size and source. Downloads show only repeater builds, selected by board name.
- Targets and proxy cards: a single main action each, signal shown in dBm, radio frequency shown to three decimal places with shorter frequency and BW labels, radio profiles labelled by band (433 / 868 MHz), and TX power applied as soon as it is selected.
- Proxy storage: each file shows its board, version, size and where it is stored (phone or proxy), with a clearly labelled action on each row.

### Fixed

- The firmware dropdown only lists releases with repeater ZIPs, marks the latest stable release as "stable" and selects it by default, even when newer pre-releases appear first.
- Saved firmware versions now retain release-candidate suffixes such as `-rc2`.
- Content and notifications at the bottom of the screen are no longer hidden behind the Android navigation bar.
- An update is only reported as complete once the target has rebooted into the new firmware; if it falls back into the bootloader, the update is reported as failed (requires the latest bootloader).
- A failed update keeps its error message on screen.
- Retrying straight after a failed update now explains that the target is still busy and that you can retry in about 30 seconds, instead of reporting a profile mismatch.
- Dropdown menus no longer fill the screen, and long names wrap.
- The Android back button closes open menus and dialogs.

