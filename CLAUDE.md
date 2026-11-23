# CLAUDE.md

## Changelog

Always update `CHANGELOG.md` with the latest changes **before every commit** (including amends). Add them under `## [Unreleased]` in the matching `### Added` / `### Changed` / `### Fixed` section. The `[Unreleased]` section becomes the GitHub release body (store notes are a fixed sentence); promotion moves the shipped entries into a version section (`scripts/release-notes.py`). Keep entries short and user-facing.

The changelog is for app users, not a git log: only record changes a user would notice (features, behaviour, UI, fixes). Never add KTLO or CI entries (pipelines, build/release scripts, tooling, store assets, refactors, dependency bumps, repo housekeeping). Merge related changes into one entry rather than listing each tweak. If a commit has no user-facing change, don't add an entry.

## Translations

The app must be translated into: English (British), Portuguese (European), Portuguese (Brazilian), Chinese (Simplified), French, German, Korean and Spanish. Every user-facing string change must cover all of them. Keep technical terms in English where that makes sense. Use a professional business tone, not casual everyday language.

## Git

- `master` is the only long-lived branch; there is no `dev`.
- Changes reach `master` through a PR; every merge builds once and ships to internal/alpha testers.
- Production is a manual promotion of an existing build (no rebuild, no merge to another branch).
