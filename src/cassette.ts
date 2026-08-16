import { canonicalJson, redact, sha256 } from "./canonical.js";

export const CASSETTE_VERSION = "runmirror.cassette/v1" as const;
export const EVENT_VERSION = "runmirror.event/v1" as const;
export type EventKind = "model" | "tool" | "file" | "approval" | "clock" | "random" | "error";
export const RECORDER_VERSION = "runmirror@0.1.1" as const;
export type RecorderVersion = typeof RECORDER_VERSION | "runmirror@0.1.0";

export interface CassetteHeader {
  version: typeof CASSETTE_VERSION;
  runId: string;
  createdAt: string;
  recorder: RecorderVersion;
  redaction: { keys: string[]; replacement: "[REDACTED]" };
}

export interface RunEventPayload {
  version: typeof EVENT_VERSION;
  sequence: number;
  id: string;
  kind: EventKind;
  atMs: number;
  previousHash: string;
  input: unknown;
  output: unknown;
}

export interface RunEvent extends RunEventPayload { hash: string }
export interface Cassette { header: CassetteHeader; events: RunEvent[] }

export interface RecorderOptions {
  runId: string;
  createdAt?: string;
  baseTimeMs?: number;
  redactKeys?: string[];
}

const EVENT_KINDS = new Set<unknown>(["model", "tool", "file", "approval", "clock", "random", "error"]);
const SHA256 = /^[a-f0-9]{64}$/u;
const INVALID_ROOT = "0".repeat(64);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isDenseArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
    && Object.keys(value).length === value.length
    && Object.keys(value).every((key, index) => key === String(index));
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function isJsonValue(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length || Object.keys(value).some((key, index) => key !== String(index))) return false;
    if (seen.has(value)) return false;
    seen.add(value);
    const valid = value.every((entry) => isJsonValue(entry, seen));
    seen.delete(value);
    return valid;
  }
  if (isRecord(value)) {
    if (seen.has(value)) return false;
    seen.add(value);
    const valid = Object.values(value).every((entry) => isJsonValue(entry, seen));
    seen.delete(value);
    return valid;
  }
  return false;
}

function validateHeader(value: unknown): string | undefined {
  if (!isRecord(value) || !exactKeys(value, ["version", "runId", "createdAt", "recorder", "redaction"])) return "header schema is invalid";
  if (value.version !== CASSETTE_VERSION) return "cassette version is unsupported";
  if (typeof value.runId !== "string" || value.runId.trim().length === 0) return "runId must be a nonblank string";
  if (!isCanonicalTimestamp(value.createdAt)) return "createdAt must be a canonical ISO timestamp";
  if (value.recorder !== RECORDER_VERSION && value.recorder !== "runmirror@0.1.0") return "recorder version is unsupported";
  if (!isRecord(value.redaction) || !exactKeys(value.redaction, ["keys", "replacement"])) return "redaction schema is invalid";
  if (!isDenseArray(value.redaction.keys) || value.redaction.keys.some((key) => typeof key !== "string" || key.trim().length === 0)) return "redaction keys must be a dense array of strings";
  if (new Set(value.redaction.keys).size !== value.redaction.keys.length) return "redaction keys must be unique";
  if (value.redaction.replacement !== "[REDACTED]") return "redaction replacement is unsupported";
  return undefined;
}

function expectedEventId(runId: string, sequence: number): string {
  return `${runId}:${String(sequence).padStart(4, "0")}`;
}

function validateEvent(value: unknown, runId: string, index: number): string | undefined {
  if (!isRecord(value) || !exactKeys(value, ["version", "sequence", "id", "kind", "atMs", "previousHash", "input", "output", "hash"])) return "event schema is invalid";
  if (value.version !== EVENT_VERSION) return "event version is unsupported";
  if (!Number.isSafeInteger(value.sequence) || (value.sequence as number) < 0) return "event sequence must be a nonnegative safe integer";
  if (value.sequence !== index) return "event sequence is non-contiguous";
  if (value.id !== expectedEventId(runId, index)) return "event id does not match runId and sequence";
  if (!EVENT_KINDS.has(value.kind)) return "event kind is unsupported";
  if (!Number.isSafeInteger(value.atMs)) return "event time must be a safe integer";
  if (typeof value.previousHash !== "string" || !SHA256.test(value.previousHash)) return "previous hash is invalid";
  if (typeof value.hash !== "string" || !SHA256.test(value.hash)) return "event hash is invalid";
  if (!isJsonValue(value.input) || !isJsonValue(value.output)) return "event input and output must be JSON values";
  return undefined;
}

export class Recorder {
  readonly header: CassetteHeader;
  readonly #baseTimeMs: number;
  readonly #events: RunEvent[] = [];

  constructor(options: RecorderOptions) {
    if (typeof options.runId !== "string" || options.runId.trim().length === 0) throw new Error("runId must be a nonblank string");
    if (options.createdAt !== undefined && !isCanonicalTimestamp(options.createdAt)) throw new Error("createdAt must be a canonical ISO timestamp");
    if (options.baseTimeMs !== undefined && !Number.isSafeInteger(options.baseTimeMs)) throw new Error("baseTimeMs must be a safe integer");
    if (options.redactKeys !== undefined && (!isDenseArray(options.redactKeys) || options.redactKeys.some((key) => typeof key !== "string" || key.trim().length === 0))) throw new Error("redactKeys must contain a dense array of nonblank strings");
    if (options.redactKeys !== undefined && new Set(options.redactKeys).size !== options.redactKeys.length) throw new Error("redactKeys must be unique");
    this.#baseTimeMs = options.baseTimeMs ?? 0;
    this.header = {
      version: CASSETTE_VERSION,
      runId: options.runId,
      createdAt: options.createdAt ?? "1970-01-01T00:00:00.000Z",
      recorder: RECORDER_VERSION,
      redaction: { keys: [...(options.redactKeys ?? [])].sort(), replacement: "[REDACTED]" },
    };
  }

  record(kind: EventKind, input: unknown, output: unknown, atMs = this.#baseTimeMs + this.#events.length): RunEvent {
    if (!EVENT_KINDS.has(kind)) throw new Error("event kind is unsupported");
    if (!Number.isSafeInteger(atMs)) throw new Error("event time must be a safe integer");
    if (!isJsonValue(input) || !isJsonValue(output)) throw new Error("event input and output must be JSON values");
    const previousHash = this.#events.at(-1)?.hash ?? sha256(canonicalJson(this.header));
    const payload: RunEventPayload = {
      version: EVENT_VERSION,
      sequence: this.#events.length,
      id: `${this.header.runId}:${String(this.#events.length).padStart(4, "0")}`,
      kind,
      atMs,
      previousHash,
      input: redact(input, this.header.redaction.keys),
      output: redact(output, this.header.redaction.keys),
    };
    const event = { ...payload, hash: sha256(`${previousHash}\n${canonicalJson(payload)}`) };
    this.#events.push(event);
    return structuredClone(event);
  }

  model(input: { model: string; prompt: string; [key: string]: unknown }, output: unknown): RunEvent { return this.record("model", input, output); }
  tool(input: { name: string; arguments: unknown }, output: unknown): RunEvent { return this.record("tool", input, output); }
  file(input: { operation: "read" | "write" | "delete"; path: string; [key: string]: unknown }, output: unknown): RunEvent { return this.record("file", input, output); }
  approval(input: { action: string; reason?: string }, output: { approved: boolean; by?: string }): RunEvent { return this.record("approval", input, output); }
  clock(label: string, valueMs: number): RunEvent { return this.record("clock", { label }, valueMs, valueMs); }
  random(label: string, value: number): RunEvent { return this.record("random", { label }, value); }
  error(input: { operation: string }, output: { name: string; message: string; code?: string }): RunEvent { return this.record("error", input, output); }

  cassette(): Cassette { return { header: structuredClone(this.header), events: structuredClone(this.#events) }; }
  jsonl(): string { const cassette = this.cassette(); return `${[canonicalJson(cassette.header), ...cassette.events.map(canonicalJson)].join("\n")}\n`; }
}

export function parseCassette(text: string): Cassette {
  const lines = text.split(/\r?\n/u).filter((line) => line.length > 0);
  if (lines.length === 0) throw new Error("empty cassette");
  const values = lines.map((line, index) => {
    try { return JSON.parse(line) as unknown; }
    catch { throw new Error(`corrupt JSON at line ${index + 1}`); }
  });
  const headerValue = values[0];
  const headerIssue = validateHeader(headerValue);
  if (headerIssue !== undefined) throw new Error(`invalid cassette header: ${headerIssue}`);
  const header = headerValue as CassetteHeader;
  const eventValues = values.slice(1);
  for (let index = 0; index < eventValues.length; index += 1) {
    const issue = validateEvent(eventValues[index], header.runId, index);
    if (issue !== undefined) throw new Error(`invalid cassette event at line ${index + 2}: ${issue}`);
  }
  return { header, events: eventValues as RunEvent[] };
}

export function verifyCassette(cassette: unknown): { valid: boolean; eventIndex?: number; reason?: string; rootHash: string } {
  if (!isRecord(cassette) || !exactKeys(cassette, ["header", "events"])) return { valid: false, reason: "cassette schema is invalid", rootHash: INVALID_ROOT };
  const headerIssue = validateHeader(cassette.header);
  if (headerIssue !== undefined) return { valid: false, reason: headerIssue, rootHash: INVALID_ROOT };
  if (!isDenseArray(cassette.events)) return { valid: false, reason: "events must be a dense array", rootHash: INVALID_ROOT };
  const typed = cassette as unknown as Cassette;
  let previousHash = sha256(canonicalJson(typed.header));
  for (let index = 0; index < typed.events.length; index += 1) {
    const event = typed.events[index];
    const issue = validateEvent(event, typed.header.runId, index);
    if (issue !== undefined) return { valid: false, eventIndex: index, reason: issue, rootHash: previousHash };
    if (event === undefined) return { valid: false, eventIndex: index, reason: "missing event", rootHash: previousHash };
    if (event.previousHash !== previousHash) return { valid: false, eventIndex: index, reason: "previous hash mismatch", rootHash: previousHash };
    const { hash, ...payload } = event;
    const expected = sha256(`${previousHash}\n${canonicalJson(payload)}`);
    if (hash !== expected) return { valid: false, eventIndex: index, reason: "event hash mismatch", rootHash: previousHash };
    previousHash = hash;
  }
  return { valid: true, rootHash: previousHash };
}
