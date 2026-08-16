import { createHash } from "node:crypto";

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("non-finite number in canonical JSON");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length || Object.keys(value).some((key, index) => key !== String(index))) throw new TypeError("sparse or extended arrays are not canonical JSON");
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError("unsupported non-plain object in canonical JSON");
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new TypeError(`unsupported value: ${typeof value}`);
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

const defaultSecretKey = /(authorization|api[-_]?key|password|secret|token|cookie)/i;
const defaultSecretValue = /\b(?:sk|gh[opsu]|xox[baprs])[-_][A-Za-z0-9_-]{6,}\b|Bearer\s+[A-Za-z0-9._~+/-]+=*/gi;

function assertJsonValue(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return;
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length || Object.keys(value).some((key, index) => key !== String(index))) throw new TypeError("sparse or extended arrays are not JSON values");
    if (seen.has(value)) throw new TypeError("cyclic values are not JSON values");
    seen.add(value);
    value.forEach((entry) => assertJsonValue(entry, seen));
    seen.delete(value);
    return;
  }
  if (value !== null && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError("non-plain objects are not JSON values");
    if (seen.has(value)) throw new TypeError("cyclic values are not JSON values");
    seen.add(value);
    Object.values(value).forEach((entry) => assertJsonValue(entry, seen));
    seen.delete(value);
    return;
  }
  throw new TypeError(`unsupported non-JSON value: ${typeof value}`);
}

export function redact(value: unknown, keys: readonly string[]): unknown {
  assertJsonValue(value);
  const configured = new Set(keys.map((key) => key.toLowerCase()));
  const visit = (item: unknown, key?: string): unknown => {
    if (key !== undefined && (defaultSecretKey.test(key) || configured.has(key.toLowerCase()))) return "[REDACTED]";
    if (typeof item === "string") return item.replace(defaultSecretValue, "[REDACTED]");
    if (Array.isArray(item)) {
      if (Object.keys(item).length !== item.length || Object.keys(item).some((key, index) => key !== String(index))) throw new TypeError("sparse or extended arrays are not JSON values");
      return item.map((entry) => visit(entry));
    }
    if (item !== null && typeof item === "object") {
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) throw new TypeError("non-plain objects are not JSON values");
      return Object.fromEntries(Object.entries(item).map(([childKey, child]) => [childKey, visit(child, childKey)]));
    }
    if (item === null || typeof item === "boolean") return item;
    if (typeof item === "number" && Number.isFinite(item)) return item;
    throw new TypeError(`unsupported non-JSON value: ${typeof item}`);
  };
  return visit(value);
}

/** Safe text for diagnostics: recognizable secret material is replaced, with a domain-separated correlation token. */
export function redactDiagnostic(value: unknown, keys: readonly string[]): string {
  const original = String(value);
  const configured = new Set(keys.map((key) => key.toLowerCase()));
  const segments = original.split(/[^A-Za-z0-9_-]+/u).filter(Boolean);
  const secretSegment = segments.some((segment) => defaultSecretKey.test(segment) || configured.has(segment.toLowerCase()));
  const redacted = redact(original, keys);
  const safe = typeof redacted === "string" ? redacted : "[REDACTED]";
  if (!secretSegment && safe === original) return original;
  return `[REDACTED sha256:${sha256(`runmirror.diagnostic/v1\n${original}`).slice(0, 16)}]`;
}

export function firstDifference(expected: unknown, actual: unknown, path = "$" ): { path: string; expected: unknown; actual: unknown } | undefined {
  if (expected === undefined || actual === undefined) {
    return expected === actual ? undefined : { path, expected, actual };
  }
  if (canonicalJson(expected) === canonicalJson(actual)) return undefined;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const length = Math.max(expected.length, actual.length);
    for (let index = 0; index < length; index += 1) {
      const diff = firstDifference(expected[index], actual[index], `${path}[${index}]`);
      if (diff !== undefined) return diff;
    }
  }
  if (expected !== null && actual !== null && typeof expected === "object" && typeof actual === "object" && !Array.isArray(expected) && !Array.isArray(actual)) {
    const expectedRecord = expected as Record<string, unknown>;
    const actualRecord = actual as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(expectedRecord), ...Object.keys(actualRecord)])].sort();
    for (const key of keys) {
      const diff = firstDifference(expectedRecord[key], actualRecord[key], `${path}.${key}`);
      if (diff !== undefined) return diff;
    }
  }
  return { path, expected, actual };
}
