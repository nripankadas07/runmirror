# Changelog

## [0.1.1] - 2026-08-16

### Changed

- Replay now snapshots authenticated cassettes, passes deeply frozen event clones to adapters, and re-verifies both the snapshot and caller-owned cassette before returning. An adapter can no longer rewrite expected output after the initial integrity check.
- New recordings identify as `runmirror@0.1.1`; the parser remains compatible with `runmirror@0.1.0` cassettes.
- Trailing CLI operands and option-like positional values are rejected instead of silently ignored.
- Dispatch CLI commands only through a fixed command-to-handler allowlist; unknown
  commands cannot select or bypass a handler.
- Sparse or extended redaction-key and authenticated event arrays are rejected as non-canonical cassette structure.
- Artifact sets use component-verified staging, directory/target identity rechecks, per-file atomic renames, and set-level backup/rollback. Output-path and target-file symlinks are rejected before publication.
- Serialize cooperative artifact writers with a bounded fail-closed filesystem lock and reconcile rename-then-error outcomes by inode identity, preventing mixed concurrent bundles and restoring the full prior set after ambiguous failures.

Adapters that mutated their supplied event or input objects in `0.1.0` now receive a deterministic `adapter-error` divergence; non-canonical arrays accepted by loose direct callers are rejected.

## [0.1.0] - 2026-08-16

### Added

- Explicit recorder SDK for seven agent-run event kinds.
- Redacted canonical JSONL cassette with chained hashes.
- Integrity/corruption checks and sequential offline replay.
- First-divergence structural diff with redacted, domain-separated value fingerprints.
- Structured mismatches for undefined adapter returns and fingerprinted adapter exceptions.
- Deterministic JSON, Markdown, and single-file HTML timeline.
- Strict complete-header/event runtime validation with controlled malformed-cassette failures.
- Validation of event kind, canonical ID, sequence, safe logical time, hashes, and JSON values before replay.
- Redacted correlation fingerprints for secret-shaped/configured divergence IDs and paths.
- Markdown metadata escaping and clean-source npm package/import/CLI smoke coverage.
