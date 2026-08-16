import assert from "node:assert/strict";
import test from "node:test";
import { parseCassette, Recorder, verifyCassette } from "../src/cassette.js";
import { canonicalJson, sha256 } from "../src/canonical.js";

test("explicit recorder is deterministic and redacts before hashing", () => {
  const create = () => {
    const recorder = new Recorder({ runId: "test", createdAt: "2026-01-01T00:00:00.000Z", redactKeys: ["note"] });
    recorder.tool({ name: "fixture", arguments: { token: "synthetic-demo-token", note: "private" } }, { ok: true });
    return recorder.jsonl();
  };
  const first = create();
  assert.equal(first, create());
  assert.ok(!first.includes("synthetic-demo-token"));
  assert.ok(!first.includes("private"));
  assert.equal(verifyCassette(parseCassette(first)).valid, true);
});

test("cassette parser and verifier reject malformed headers and events without crashing", () => {
  const minimal = '{"version":"runmirror.cassette/v1","runId":"x"}\n';
  assert.throws(() => parseCassette(minimal), /invalid cassette header/u);
  assert.equal(verifyCassette({ header: { version: "runmirror.cassette/v1", runId: "x" }, events: [] }).valid, false);

  const recorder = new Recorder({ runId: "strict", createdAt: "2026-01-01T00:00:00.000Z" });
  recorder.tool({ name: "x", arguments: {} }, { ok: true });
  const header = recorder.cassette().header;
  assert.equal(verifyCassette({ header, events: [], extra: true }).valid, false);
  assert.throws(() => parseCassette(`${canonicalJson(header)}\nnull\n`), /invalid cassette event at line 2/u);
  assert.doesNotThrow(() => verifyCassette({ header, events: [null] }));
  assert.equal(verifyCassette({ header, events: [null] }).valid, false);

  const previousHash = sha256(canonicalJson(header));
  for (const partial of [{ kind: "not-a-kind" }, { id: 42 }, { id: "wrong" }, { atMs: "soon" }]) {
    const payload = { version: "runmirror.event/v1", sequence: 0, id: "strict:0000", kind: "tool", atMs: 0, previousHash, input: {}, output: {}, ...partial };
    const event = { ...payload, hash: sha256(`${previousHash}\n${canonicalJson(payload)}`) };
    const forged = { header, events: [event] };
    assert.equal(verifyCassette(forged).valid, false);
    assert.throws(() => parseCassette(`${canonicalJson(header)}\n${canonicalJson(event)}\n`), /invalid cassette event/u);
  }
});

test("recorder rejects non-JSON events and invalid runtime metadata", () => {
  assert.throws(() => new Recorder({ runId: " " }), /nonblank/u);
  assert.throws(() => new Recorder({ runId: "x", createdAt: "0" }), /canonical ISO/u);
  assert.throws(() => new Recorder({ runId: "x", createdAt: "2026-99-99T00:00:00.000Z" }), /canonical ISO/u);
  assert.throws(() => new Recorder({ runId: "x", redactKeys: ["token", "token"] }), /unique/u);
  const recorder = new Recorder({ runId: "runtime" });
  assert.throws(() => recorder.record("unknown" as "tool", {}, {}), /kind/u);
  assert.throws(() => recorder.record("tool", {}, Number.NaN), /JSON values/u);
  assert.throws(() => recorder.record("tool", {}, new Date("2026-01-01T00:00:00.000Z")), /JSON values/u);
  const sparse: unknown[] = [];
  sparse.length = 1;
  assert.throws(() => recorder.record("tool", {}, sparse), /JSON values/u);
});

test("tampering and corrupt JSON are detected", () => {
  const recorder = new Recorder({ runId: "tamper" });
  recorder.random("x", 0.5);
  const cassette = recorder.cassette();
  const event = cassette.events[0];
  assert.ok(event);
  event.output = 0.7;
  assert.deepEqual(verifyCassette(cassette), { valid: false, eventIndex: 0, reason: "event hash mismatch", rootHash: event.previousHash });
  assert.throws(() => parseCassette('{"version":"runmirror.cassette/v1","runId":"x"}\n{bad}\n'), /corrupt JSON at line 2/u);
});
