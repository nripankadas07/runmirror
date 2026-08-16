import { Recorder, type Cassette } from "./cassette.js";
import { recordedOutputAdapters, replay, type ReplayResult } from "./replay.js";

export interface DemoRun { cassette: Cassette; jsonl: string; replay: ReplayResult; driftProbe: ReplayResult }

export async function createDemoRun(): Promise<DemoRun> {
  const recorder = new Recorder({ runId: "offline-demo", createdAt: "2026-08-16T00:00:00.000Z", baseTimeMs: 1_700_000_000_000, redactKeys: ["privateNote"] });
  recorder.clock("run-start", 1_700_000_000_000);
  recorder.random("planner-branch", 0.125);
  recorder.model({ model: "fixture-model", prompt: "Summarize README", apiKey: "synthetic-demo-token-123456" }, { text: "Use an explicit recorder.", usage: { input: 3, output: 4 } });
  recorder.tool({ name: "repo.read", arguments: { path: "README.md" } }, { text: "# RunMirror", bytes: 11 });
  recorder.file({ operation: "write", path: "SUMMARY.md", contentHash: "sha256:fixture" }, { bytesWritten: 28, contentHash: "sha256:result" });
  recorder.approval({ action: "write SUMMARY.md", reason: "demo" }, { approved: true, by: "reviewer@example.test" });
  recorder.error({ operation: "optional-upload" }, { name: "OfflineModeError", message: "network disabled", code: "OFFLINE" });
  const cassette = recorder.cassette();
  const baseline = await replay(cassette, recordedOutputAdapters());
  const driftProbe = await replay(cassette, recordedOutputAdapters({ tool: () => ({ text: "# RunMirror changed", bytes: 19 }) }));
  return { cassette, jsonl: recorder.jsonl(), replay: baseline, driftProbe };
}
