# Limitations

- Artifact publication rejects symlinks in every existing output-path component, rechecks directory identities, stages complete sets, reconciles ambiguous rename failures, and rolls back on a publish failure. Cooperative writers serialize through a bounded five-second `.artifact-write.lock`; a crash or incomplete recovery leaves that lock in place so later writers fail closed. After verifying that no writer is active, an operator must inspect any `.artifact-stage-*` recovery directory before manually removing a stale lock. Non-cooperating processes are not serialized. Node does not expose portable directory-file-descriptor-relative rename APIs, so a process that can concurrently replace trusted ancestor directories may still race between identity checks and filesystem operations; choose an output tree not writable by an attacker.
- Explicit cassette input paths follow the operating system's normal symlink resolution; the CLI does not claim an input-directory confinement boundary.
- RunMirror records only boundaries the host explicitly sends to it.
- It does not monkey-patch model SDKs, intercept network traffic, trace processes, watch files, replace `Date`, or replace `Math.random`.
- Recorded-output adapters prove cassette mechanics, not behavioral equivalence of a real dependency.
- JSON values are supported; streams, cycles, functions, symbols, and binary values require an application adapter.
- Hash chaining detects mutation but does not authenticate an author. Use an external signing system for identity provenance.
- Redaction is best-effort. Divergence values are fingerprinted and recognizable/configured secret metadata is redacted, but applications should avoid recording unnecessary sensitive data. In particular, `runId` is part of the raw cassette header and must never be a credential.
- Replay is sequential and in-memory in v1; it does not model concurrent scheduling.
- Error events are data. RunMirror does not reproduce JavaScript stack identity or native error objects.
