import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createDemoRun } from "../src/demo.js";
import { htmlReport, markdownReport, writeArtifacts } from "../src/report.js";
import { recordedOutputAdapters, replay } from "../src/replay.js";
import { Recorder } from "../src/cassette.js";

test("replay stops at the first structural divergence", async () => {
  const demo = await createDemoRun();
  assert.equal(demo.replay.divergence, null);
  assert.equal(demo.replay.matchedEvents, 7);
  assert.equal(demo.driftProbe.divergence?.eventIndex, 3);
  assert.equal(demo.driftProbe.divergence?.eventId, "offline-demo:0003");
  assert.equal(demo.driftProbe.divergence?.kind, "tool");
  assert.equal(demo.driftProbe.divergence?.reason, "output-mismatch");
  assert.equal(demo.driftProbe.divergence?.path, "$.bytes");
  assert.equal(demo.driftProbe.divergence?.expected.valueType, "number");
  assert.equal(demo.driftProbe.divergence?.actual.valueType, "number");
  assert.match(demo.driftProbe.divergence?.actual.digest ?? "", /^[a-f0-9]{64}$/u);

  const incomplete = recordedOutputAdapters();
  delete incomplete.random;
  const missing = await replay(demo.cassette, incomplete);
  assert.equal(missing.divergence?.reason, "missing-adapter");
  assert.equal(missing.divergence?.eventIndex, 1);

  const inherited = Object.create({ model: () => ({ text: "must not execute" }) }) as ReturnType<typeof recordedOutputAdapters>;
  const ownOnly = await replay(demo.cassette, inherited);
  assert.equal(ownOnly.divergence?.reason, "missing-adapter");
  assert.equal(ownOnly.divergence?.eventIndex, 0);

  const missingField = await replay(demo.cassette, recordedOutputAdapters({ tool: () => ({ text: "# RunMirror" }) }));
  assert.equal(missingField.divergence?.path, "$.bytes");
  assert.equal(missingField.divergence?.actual.valueType, "undefined");
});

test("all attacker-controlled divergence labels are redacted or fingerprinted", async () => {
  const secret = "sk_event_secret_987654";
  const recorder = new Recorder({ runId: secret, createdAt: "2026-01-01T00:00:00.000Z", redactKeys: ["customerNote"] });
  recorder.tool({ name: "x", arguments: {} }, {});
  const byEventId = await replay(recorder.cassette(), {});
  assert.ok(!JSON.stringify(byEventId).includes(secret));
  assert.match(byEventId.runId, /^\[REDACTED sha256:[a-f0-9]{16}\]$/u);
  assert.match(byEventId.divergence?.eventId ?? "", /^\[REDACTED sha256:[a-f0-9]{16}\]$/u);

  const byPath = await replay(recorder.cassette(), recordedOutputAdapters({ tool: () => ({ customerNote: "plain" }) }));
  assert.ok(!JSON.stringify(byPath).includes("customerNote"));
  assert.match(byPath.divergence?.path ?? "", /^\[REDACTED sha256:[a-f0-9]{16}\]$/u);
});

test("Markdown and HTML reports escape untrusted run metadata", async () => {
  const recorder = new Recorder({ runId: "`\n\n## Forged section\n- forged\n<img src=x onerror=alert(1)>", createdAt: "2026-01-01T00:00:00.000Z" });
  recorder.tool({ name: "x", arguments: {} }, {});
  const cassette = recorder.cassette();
  const baseline = await replay(cassette, recordedOutputAdapters());
  const run = { cassette, jsonl: recorder.jsonl(), replay: baseline, driftProbe: baseline };
  const markdown = markdownReport(run);
  assert.ok(!markdown.includes("<img src=x"));
  assert.ok(!markdown.includes("\n## Forged section"));
  assert.ok(!markdown.includes("\n- forged"));
  assert.ok(!htmlReport(run).includes("<img src=x"));
});

test("CLI returns controlled nonzero results for malformed cassettes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "runmirror-malformed-"));
  const minimal = join(directory, "minimal.jsonl");
  await writeFile(minimal, '{"version":"runmirror.cassette/v1","runId":"x"}\n');
  const invalidHeader = spawnSync(process.execPath, ["dist/src/cli.js", "verify", minimal], { encoding: "utf8" });
  assert.equal(invalidHeader.status, 1);
  assert.match(invalidHeader.stderr, /invalid cassette header/u);
  assert.ok(!invalidHeader.stderr.includes("TypeError"));

  const recorder = new Recorder({ runId: "cli-malformed" });
  const nullEvent = join(directory, "null-event.jsonl");
  await writeFile(nullEvent, `${JSON.stringify(recorder.cassette().header)}\nnull\n`);
  const invalidEvent = spawnSync(process.execPath, ["dist/src/cli.js", "replay", nullEvent], { encoding: "utf8" });
  assert.equal(invalidEvent.status, 1);
  assert.match(invalidEvent.stderr, /invalid cassette event at line 2/u);
  assert.ok(!invalidEvent.stderr.includes("TypeError"));
});

test("direct replay of a malformed runtime value returns invalid integrity", async () => {
  const result = await replay(null as unknown as Parameters<typeof replay>[0], recordedOutputAdapters());
  assert.equal(result.integrity.valid, false);
  assert.equal(result.totalEvents, 0);
  assert.equal(result.divergence, null);
});

test("divergence artifacts fingerprint adapter values and handle undefined safely", async () => {
  const demo = await createDemoRun();
  const rawSecret = "classified-adapter-output-value";
  const mismatch = await replay(demo.cassette, recordedOutputAdapters({
    tool: () => ({ bytes: 11, text: rawSecret }),
  }));
  assert.equal(mismatch.divergence?.reason, "output-mismatch");
  assert.equal(mismatch.divergence?.path, "$.text");
  assert.ok(!JSON.stringify(mismatch).includes(rawSecret));
  assert.deepEqual(Object.keys(mismatch.divergence?.actual ?? {}).sort(), ["digest", "encoding", "valueType"]);

  const adapterError = await replay(demo.cassette, recordedOutputAdapters({
    tool: () => { throw new Error(`failed with ${rawSecret}`); },
  }));
  assert.equal(adapterError.divergence?.reason, "adapter-error");
  assert.ok(!JSON.stringify(adapterError).includes(rawSecret));

  const undefinedOutput = await replay(demo.cassette, recordedOutputAdapters({ tool: () => undefined }));
  assert.equal(undefinedOutput.divergence?.reason, "adapter-error");
  assert.equal(undefinedOutput.divergence?.path, "$" );
  assert.equal(undefinedOutput.divergence?.actual.valueType, "undefined");

  const nonJsonOutput = await replay(demo.cassette, recordedOutputAdapters({ tool: () => new Date("2026-01-01T00:00:00.000Z") }));
  assert.equal(nonJsonOutput.divergence?.reason, "adapter-error");
  assert.equal(nonJsonOutput.divergence?.actual.valueType, "object");

  const nestedUndefined = await replay(demo.cassette, recordedOutputAdapters({ tool: () => ({ text: "# RunMirror", bytes: 11, hidden: undefined }) }));
  assert.equal(nestedUndefined.divergence?.reason, "adapter-error");
});

test("artifact writer produces a self-contained deterministic timeline", async () => {
  const demo = await createDemoRun();
  const first = await mkdtemp(join(tmpdir(), "runmirror-a-"));
  const second = await mkdtemp(join(tmpdir(), "runmirror-b-"));
  await writeArtifacts(first, demo);
  await writeArtifacts(second, demo);
  for (const name of ["cassette.jsonl", "report.json", "report.md", "index.html"]) {
    assert.equal(await readFile(join(first, name), "utf8"), await readFile(join(second, name), "utf8"));
  }
  assert.match(await readFile(join(first, "index.html"), "utf8"), /<!doctype html>/u);
  const golden = JSON.parse(await readFile("examples/golden/expected.json", "utf8")) as { events: number; rootHash: string; baselineMatched: number };
  assert.equal(demo.cassette.events.length, golden.events);
  assert.equal(demo.replay.integrity.rootHash, golden.rootHash);
  assert.equal(demo.replay.matchedEvents, golden.baselineMatched);
});
