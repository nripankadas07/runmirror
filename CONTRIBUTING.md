# Contributing

1. Describe the boundary or artifact contract in an issue.
2. Keep runtime dependencies at zero and integrations explicit.
3. Add deterministic unit and integration coverage.
4. Run `npm test` and `npm run demo` on Node 22 or newer.
5. Add a new schema version for breaking cassette or replay changes.

Do not add monkey-patching or claim transparent interception without a separately reviewed design and precise limitations.
