# Changelog

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
