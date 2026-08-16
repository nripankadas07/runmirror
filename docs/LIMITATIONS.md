# Limitations

- RunMirror records only boundaries the host explicitly sends to it.
- It does not monkey-patch model SDKs, intercept network traffic, trace processes, watch files, replace `Date`, or replace `Math.random`.
- Recorded-output adapters prove cassette mechanics, not behavioral equivalence of a real dependency.
- JSON values are supported; streams, cycles, functions, symbols, and binary values require an application adapter.
- Hash chaining detects mutation but does not authenticate an author. Use an external signing system for identity provenance.
- Redaction is best-effort. Divergence values are fingerprinted and recognizable/configured secret metadata is redacted, but applications should avoid recording unnecessary sensitive data. In particular, `runId` is part of the raw cassette header and must never be a credential.
- Replay is sequential and in-memory in v1; it does not model concurrent scheduling.
- Error events are data. RunMirror does not reproduce JavaScript stack identity or native error objects.
