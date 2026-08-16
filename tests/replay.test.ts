import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rename as fsRename, rmdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createDemoRun } from "../src/demo.js";
import { htmlReport, markdownReport, writeArtifacts } from "../src/report.js";
import { writeArtifactSet } from "../src/safe-output.js";
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

test("adapters cannot mutate authenticated expectations and post-replay integrity is checked", async () => {
  const recorder = new Recorder({ runId: "immutable", createdAt: "2026-01-01T00:00:00.000Z" });
  recorder.tool({ name: "x", arguments: {} }, { answer: "expected" });
  const cassette = recorder.cassette();
  const attemptedMutation = await replay(cassette, {
    tool: (_input, event) => {
      event.output = { answer: "forged" };
      return { answer: "forged" };
    },
  });
  assert.equal(attemptedMutation.divergence?.reason, "adapter-error");
  assert.equal(attemptedMutation.integrity.valid, true);
  assert.equal(cassette.events[0]?.output && (cassette.events[0]?.output as { answer: string }).answer, "expected");

  const externallyMutated = recorder.cassette();
  const mutationDetected = await replay(externallyMutated, {
    tool: () => {
      const event = externallyMutated.events[0];
      assert.ok(event);
      event.output = { answer: "changed-outside-adapter-argument" };
      return { answer: "expected" };
    },
  });
  assert.equal(mutationDetected.integrity.valid, false);
  assert.equal(mutationDetected.integrity.reason, "event hash mismatch");
});

test("CLI rejects trailing operands and option-like output paths", () => {
  for (const args of [["demo", "out", "extra"], ["demo", "--typo"], ["verify", "cassette.jsonl", "extra"]]) {
    const cli = spawnSync(process.execPath, ["dist/src/cli.js", ...args], { encoding: "utf8" });
    assert.equal(cli.status, 1);
    assert.match(cli.stderr, /usage:/u);
  }
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

test("artifact publication rejects symlink and non-directory targets before writing", async () => {
  const root = await mkdtemp(join(tmpdir(), "runmirror-safe-output-"));
  const victim = join(root, "victim.txt");
  await writeFile(victim, "unchanged\n");
  const demo = await createDemoRun();

  const fileTarget = join(root, "file-target");
  await mkdir(fileTarget);
  await symlink(victim, join(fileTarget, "cassette.jsonl"));
  await assert.rejects(writeArtifacts(fileTarget, demo), /regular file/u);
  assert.equal(await readFile(victim, "utf8"), "unchanged\n");
  assert.deepEqual(await readdir(fileTarget), ["cassette.jsonl"]);

  const directoryVictim = join(root, "directory-victim");
  await mkdir(directoryVictim);
  const linkedOutput = join(root, "linked-output");
  await symlink(directoryVictim, linkedOutput);
  await assert.rejects(writeArtifacts(linkedOutput, demo), /symbolic-link component/u);
  await assert.rejects(writeArtifacts(join(linkedOutput, "nested"), demo), /symbolic-link component/u);
  assert.deepEqual(await readdir(directoryVictim), []);

  const parentFile = join(root, "not-a-directory");
  await writeFile(parentFile, "x");
  await assert.rejects(writeArtifacts(join(parentFile, "child"), demo));

  const transactional = join(root, "transactional");
  await mkdir(transactional);
  await writeFile(join(transactional, "one.txt"), "original\n");
  let publishes = 0;
  await assert.rejects(writeArtifactSet(transactional, { "one.txt": "replacement\n", "two.txt": "new\n" }, {
    publishRename: async (source, destination) => {
      publishes += 1;
      if (publishes === 2) throw new Error("injected second publish failure");
      await fsRename(source, destination);
    },
  }), /injected second publish failure/u);
  assert.equal(publishes, 2);
  assert.equal(await readFile(join(transactional, "one.txt"), "utf8"), "original\n");
  assert.deepEqual(await readdir(transactional), ["one.txt"]);

  const ambiguous = join(root, "ambiguous-rename");
  await mkdir(ambiguous);
  await writeFile(join(ambiguous, "one.txt"), "original-one\n");
  await writeFile(join(ambiguous, "two.txt"), "original-two\n");
  let completedRenames = 0;
  await assert.rejects(writeArtifactSet(ambiguous, { "one.txt": "replacement-one\n", "two.txt": "replacement-two\n" }, {
    publishRename: async (source, destination) => {
      await fsRename(source, destination);
      completedRenames += 1;
      if (completedRenames === 2) throw new Error("injected post-rename failure");
    },
  }), /injected post-rename failure/u);
  assert.equal(await readFile(join(ambiguous, "one.txt"), "utf8"), "original-one\n");
  assert.equal(await readFile(join(ambiguous, "two.txt"), "utf8"), "original-two\n");
  assert.deepEqual(await readdir(ambiguous), ["one.txt", "two.txt"]);

  const concurrent = join(root, "concurrent-writers");
  await mkdir(concurrent);
  const pause = async (): Promise<void> => new Promise((resolvePause) => { setTimeout(resolvePause, 20); });
  const writer = async (label: "A" | "B"): Promise<void> => {
    let writerRenames = 0;
    await writeArtifactSet(concurrent, { "one.txt": `${label}\n`, "two.txt": `${label}\n` }, {
      publishRename: async (source, destination) => {
        writerRenames += 1;
        if (label === "A" && writerRenames === 1) await pause();
        await fsRename(source, destination);
        if (label === "B" && writerRenames === 1) await pause();
      },
    });
  };
  await Promise.all([writer("A"), writer("B")]);
  const concurrentContents = await Promise.all(["one.txt", "two.txt"].map(async (name) => readFile(join(concurrent, name), "utf8")));
  assert.equal(concurrentContents[0], concurrentContents[1]);
  assert.ok(concurrentContents[0] === "A\n" || concurrentContents[0] === "B\n");
  assert.deepEqual(await readdir(concurrent), ["one.txt", "two.txt"]);

  const stale = join(root, "stale-lock");
  await mkdir(stale);
  const staleLock = join(stale, ".artifact-write.lock");
  await mkdir(staleLock);
  await assert.rejects(writeArtifactSet(stale, { "one.txt": "unpublished\n" }, { lockTimeoutMs: 0 }), /lock is held or stale/u);
  assert.deepEqual(await readdir(stale), [".artifact-write.lock"]);
  await rmdir(staleLock);
});
