# Release process

1. Run `npm ci && npm run package:smoke && npm run check` on Node 22. The smoke test packs from source, installs the tarball, imports the library, and executes the installed CLI.
2. Compare the cassette root and drift probe to `examples/golden/expected.json`.
3. Run CLI `verify` and `replay` against `artifacts/demo/cassette.jsonl`.
4. Inspect the cassette and divergence/report metadata for redacted fixture secrets.
5. Review cassette, event, replay, and report schema versions.
6. Update package version and `CHANGELOG.md` together.
7. Package source plus demo evidence; describe integrations as explicit adapters, never transparent interception.
