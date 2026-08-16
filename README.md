# RunMirror

RunMirror is a zero-runtime-dependency TypeScript SDK for explicitly recording agent-run boundaries and replaying them offline. It captures model, tool, file, approval, clock, random, and error events in a canonical hash-chained JSONL cassette, then reports the first output divergence during replay.

RunMirror uses explicit adapters and recorder calls. It does **not** claim transparent interception of model SDKs, child processes, filesystems, clocks, or random-number generators.

## Quick start

Requires Node.js 22 or newer.

```bash
npm ci
npm test
npm run demo
node dist/src/cli.js verify artifacts/demo/cassette.jsonl
node dist/src/cli.js replay artifacts/demo/cassette.jsonl
```

Open `artifacts/demo/index.html` for the static timeline.

## Recorder SDK

```ts
import { Recorder } from "runmirror";

const recorder = new Recorder({
  runId: "checkout-42",
  createdAt: "2026-08-16T00:00:00.000Z",
  redactKeys: ["customerNote"],
});

recorder.model(
  { model: "fixture-model", prompt: "Plan the change" },
  { text: "Inspect tests first" },
);
recorder.tool(
  { name: "repo.read", arguments: { path: "README.md" } },
  { text: "# Project" },
);

const cassette = recorder.cassette();
const jsonl = recorder.jsonl();
```

The host application owns every integration point and decides exactly what is recorded.

## Replay

Replay accepts one explicit handler per event kind. It strictly validates the complete header and every event before an adapter can run, then stops at the first missing adapter, thrown adapter error, or structural output mismatch. Divergence values are redacted before comparison and represented only by domain-separated SHA-256 fingerprints. Secret-shaped/configured event IDs and paths are replaced by redacted correlation fingerprints, so raw adapter outputs, exception messages, and recognizable secret metadata are not copied into replay artifacts.

`recordedOutputAdapters()` is intentionally a fixture adapter for offline demonstrations. A real integration should supply adapters that call the system being tested.

## Stable artifacts

- `runmirror.cassette/v1`
- `runmirror.event/v1`
- `runmirror.replay/v1`
- `runmirror.report/v1`

Events commit to the complete cassette header and previous event. Header/event schemas, kinds, IDs, sequence numbers, logical times, redaction metadata, and JSON values are runtime-validated. Secret redaction happens before hashing and serialization.

## Outputs

- `cassette.jsonl` — canonical replay cassette.
- `report.json` — machine-readable integrity, replay, and seeded-drift result.
- `report.md` — review summary.
- `index.html` — dependency-free static event timeline.

See [architecture](docs/ARCHITECTURE.md), [limitations](docs/LIMITATIONS.md), and [research notes](docs/RESEARCH.md).

## License

MIT

See the [roadmap](ROADMAP.md), [research notes](docs/RESEARCH.md), and [AI-assistance disclosure](AI_ASSISTED.md).
