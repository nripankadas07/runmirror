import { canonicalJson, firstDifference, redact, redactDiagnostic, sha256 } from "./canonical.js";
import { type Cassette, type EventKind, type RunEvent, verifyCassette } from "./cassette.js";

export type ReplayHandler = (input: unknown, event: RunEvent) => unknown | Promise<unknown>;
export type ReplayAdapters = Partial<Record<EventKind, ReplayHandler>>;

export interface DivergenceFingerprint {
  encoding: "sha256";
  digest: string;
  valueType: "array" | "bigint" | "boolean" | "function" | "null" | "number" | "object" | "string" | "symbol" | "undefined";
}

export interface Divergence {
  eventIndex: number;
  eventId: string;
  kind: EventKind;
  path: string;
  expected: DivergenceFingerprint;
  actual: DivergenceFingerprint;
  reason: "missing-adapter" | "output-mismatch" | "adapter-error";
}

export interface ReplayResult {
  version: "runmirror.replay/v1";
  runId: string;
  integrity: ReturnType<typeof verifyCassette>;
  matchedEvents: number;
  totalEvents: number;
  divergence: Divergence | null;
}

function valueType(value: unknown): DivergenceFingerprint["valueType"] {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function fingerprint(value: unknown, redactionKeys: readonly string[]): DivergenceFingerprint {
  const type = valueType(value);
  let encoded: string;
  try {
    const safeValue = redact(value, redactionKeys);
    encoded = safeValue === undefined
      ? '{"$runmirror":"undefined"}'
      : canonicalJson(safeValue);
  } catch {
    encoded = canonicalJson({ unsupportedValueType: type });
  }
  return {
    encoding: "sha256",
    digest: sha256(`runmirror.divergence/v1\n${encoded}`),
    valueType: type,
  };
}

function divergence(
  event: RunEvent,
  path: string,
  expected: unknown,
  actual: unknown,
  reason: Divergence["reason"],
  redactionKeys: readonly string[],
): Divergence {
  return {
    eventIndex: event.sequence,
    eventId: redactDiagnostic(event.id, redactionKeys),
    kind: event.kind,
    path: redactDiagnostic(path, redactionKeys),
    expected: fingerprint(expected, redactionKeys),
    actual: fingerprint(actual, redactionKeys),
    reason,
  };
}

function deepFreezeJson<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreezeJson(child);
    Object.freeze(value);
  }
  return value;
}

export async function replay(cassette: Cassette, adapters: ReplayAdapters): Promise<ReplayResult> {
  const integrity = verifyCassette(cassette);
  const candidate = cassette !== null && typeof cassette === "object"
    ? cassette as unknown as { header?: { runId?: unknown; redaction?: { keys?: unknown } }; events?: unknown }
    : {};
  const candidateKeys = Array.isArray(candidate.header?.redaction?.keys) && candidate.header.redaction.keys.every((key) => typeof key === "string")
    ? candidate.header.redaction.keys as string[]
    : [];
  const runId = redactDiagnostic(typeof candidate.header?.runId === "string" ? candidate.header.runId : "invalid-cassette", candidateKeys);
  const totalEvents = Array.isArray(candidate.events) ? candidate.events.length : 0;
  if (!integrity.valid) return { version: "runmirror.replay/v1", runId, integrity, matchedEvents: 0, totalEvents, divergence: null };
  const authenticated = structuredClone(cassette);
  const authenticatedIntegrity = verifyCassette(authenticated);
  if (!authenticatedIntegrity.valid) return { version: "runmirror.replay/v1", runId, integrity: authenticatedIntegrity, matchedEvents: 0, totalEvents, divergence: null };
  const finish = (matchedEvents: number, replayDivergence: Divergence | null): ReplayResult => {
    const sourceIntegrity = verifyCassette(cassette);
    const snapshotIntegrity = verifyCassette(authenticated);
    return {
      version: "runmirror.replay/v1",
      runId,
      integrity: sourceIntegrity.valid ? snapshotIntegrity : sourceIntegrity,
      matchedEvents,
      totalEvents: authenticated.events.length,
      divergence: replayDivergence,
    };
  };
  let matchedEvents = 0;
  for (const event of authenticated.events) {
    const redactionKeys = authenticated.header.redaction.keys;
    const handler = Object.hasOwn(adapters, event.kind) ? adapters[event.kind] : undefined;
    if (handler === undefined) {
      return finish(matchedEvents, divergence(event, "$", event.output, undefined, "missing-adapter", redactionKeys));
    }
    let actual: unknown;
    try {
      const adapterEvent = deepFreezeJson(structuredClone(event));
      actual = await handler(adapterEvent.input, adapterEvent);
    }
    catch (error: unknown) {
      actual = { name: error instanceof Error ? error.name : "Error", message: error instanceof Error ? error.message : String(error) };
      return finish(matchedEvents, divergence(event, "$", event.output, actual, "adapter-error", redactionKeys));
    }
    let safeActual: unknown;
    try { safeActual = redact(actual, redactionKeys); }
    catch {
      return finish(matchedEvents, divergence(event, "$", event.output, actual, "adapter-error", redactionKeys));
    }
    let matches = false;
    try { matches = canonicalJson(safeActual) === canonicalJson(event.output); }
    catch { matches = false; }
    if (!matches) {
      let diff: { path: string; expected: unknown; actual: unknown };
      try { diff = firstDifference(event.output, safeActual) ?? { path: "$", expected: event.output, actual: safeActual }; }
      catch { diff = { path: "$", expected: event.output, actual: safeActual }; }
      return finish(matchedEvents, divergence(event, diff.path, diff.expected, diff.actual, "output-mismatch", redactionKeys));
    }
    matchedEvents += 1;
  }
  return finish(matchedEvents, null);
}

export function recordedOutputAdapters(overrides: ReplayAdapters = {}): ReplayAdapters {
  const echo: ReplayHandler = (_input, event) => structuredClone(event.output);
  return { model: echo, tool: echo, file: echo, approval: echo, clock: echo, random: echo, error: echo, ...overrides };
}
