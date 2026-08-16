# Architecture

```text
host application
  -> explicit Recorder.model/tool/file/approval/clock/random/error calls
  -> redact keys and credential-shaped strings
  -> canonical event payload
  -> previous-hash chain
  -> JSONL cassette
  -> integrity verification
  -> explicit replay adapters
  -> first-divergence diff
  -> JSON + Markdown + self-contained HTML timeline
```

The strictly validated cassette header is the chain anchor. Event zero references the SHA-256 hash of canonical header JSON. Every later event references the preceding event hash. The event hash commits to the previous hash plus canonical event payload. Verification rejects incomplete headers, unknown or malformed fields, unsupported event kinds, noncanonical IDs, unsafe logical times, non-JSON values, and invalid versions before hashing or replay.

Replay validates the full schema and chain, snapshots the authenticated cassette, and supplies each handler a deeply frozen event clone. The snapshot and caller-owned cassette are verified again before a result is returned, so adapter or concurrent mutation cannot rewrite the expected output after authentication. Handlers return an actual output; comparison uses canonical JSON and then recursively locates the first differing path. Raw differing values and adapter exceptions are fingerprinted; diagnostic event IDs and paths pass through metadata redaction before being returned.

Logical timestamps are supplied by the recorder caller or derived from a configured deterministic base. RunMirror never reads the wall clock implicitly while recording.
