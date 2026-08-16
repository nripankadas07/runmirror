import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DemoRun } from "./demo.js";
import { verifyCassette } from "./cassette.js";
import { redactDiagnostic } from "./canonical.js";

export const REPORT_VERSION = "runmirror.report/v1" as const;

function normalizeDisplayText(value: unknown): string { return String(value).replace(/[\p{Cc}\p{Cf}]+/gu, " ").replace(/\s+/gu, " ").trim(); }
function escapeHtml(value: unknown): string { return normalizeDisplayText(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function escapeMarkdown(value: unknown): string { return normalizeDisplayText(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replace(/([\\`*_[\]{}|])/gu, "\\$1"); }

export function buildReport(run: DemoRun) {
  const redactionKeys = run.cassette.header.redaction.keys;
  return {
    version: REPORT_VERSION,
    generatedBy: "runmirror@0.1.0",
    deterministic: true,
    runId: redactDiagnostic(run.cassette.header.runId, redactionKeys),
    integrity: verifyCassette(run.cassette),
    eventCount: run.cassette.events.length,
    kinds: [...new Set(run.cassette.events.map((event) => event.kind))].sort(),
    replay: run.replay,
    driftProbe: run.driftProbe,
  };
}

export function markdownReport(run: DemoRun): string {
  const report = buildReport(run);
  const rows = run.cassette.events.map((event) => `| ${event.sequence} | ${escapeMarkdown(event.kind)} | ${event.atMs} | \`${event.hash.slice(0, 12)}\` |`).join("\n");
  const divergence = report.driftProbe.divergence;
  return `# RunMirror replay report\n\nArtifact: \`${REPORT_VERSION}\`\n\n- Run: \`${escapeMarkdown(report.runId)}\`\n- Integrity valid: **${report.integrity.valid}**\n- Baseline matched: **${report.replay.matchedEvents}/${report.replay.totalEvents}**\n- Drift detected at: **${escapeMarkdown(divergence === null ? "none" : `${divergence.eventId} ${divergence.path}`)}**\n- Root hash: \`${report.integrity.rootHash}\`\n\n| # | Kind | Logical time | Hash |\n|---:|---|---:|---|\n${rows}\n\n> Replay uses explicit adapters supplied by the caller. RunMirror does not transparently intercept SDKs, processes, files, clocks, or random sources.\n`;
}

export function htmlReport(run: DemoRun): string {
  const report = buildReport(run);
  const divergence = report.driftProbe.divergence;
  const redactionKeys = run.cassette.header.redaction.keys;
  const events = run.cassette.events.map((event) => `<li><span>${event.sequence}</span><b>${escapeHtml(event.kind)}</b><code>${escapeHtml(redactDiagnostic(event.id, redactionKeys))}</code><small>${event.atMs}</small></li>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RunMirror timeline</title><style>body{margin:0;background:#0c1020;color:#e9edff;font:15px system-ui}.wrap{max-width:900px;margin:auto;padding:42px}.hero,.panel{background:#151b31;border:1px solid #303959;border-radius:16px;padding:24px;margin:18px 0}.ok{color:#72e6aa}.warn{color:#ffd078}ol{list-style:none;padding:0;position:relative}ol:before{content:"";position:absolute;left:18px;top:18px;bottom:18px;width:2px;background:#4b5b90}li{display:grid;grid-template-columns:36px 90px 1fr auto;gap:12px;align-items:center;padding:12px 0;position:relative}li span{z-index:1;background:#8ba5ff;color:#071022;border-radius:50%;width:36px;height:36px;display:grid;place-items:center;font-weight:700}code{color:#a9c8ff}small{color:#98a3bf}.note{color:#aeb7cf}</style></head><body><main class="wrap"><section class="hero"><h1>RunMirror</h1><p class="note">Explicit recorder · offline replay · ${REPORT_VERSION}</p><p class="ok">Integrity verified: ${report.integrity.valid}</p><p>Baseline replay: <b>${report.replay.matchedEvents}/${report.replay.totalEvents}</b></p><p class="warn">Seeded drift: ${escapeHtml(divergence === null ? "not detected" : `${divergence.eventId} at ${divergence.path}`)}</p></section><section class="panel"><h2>Timeline</h2><ol>${events}</ol></section><section class="panel"><h2>Root hash</h2><code>${escapeHtml(report.integrity.rootHash)}</code></section><p class="note">RunMirror does not transparently intercept model SDKs, tools, files, clocks, or randomness.</p></main></body></html>\n`;
}

export async function writeArtifacts(outDir: string, run: DemoRun): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await Promise.all([
    writeFile(join(outDir, "cassette.jsonl"), run.jsonl),
    writeFile(join(outDir, "report.json"), `${JSON.stringify(buildReport(run), null, 2)}\n`),
    writeFile(join(outDir, "report.md"), markdownReport(run)),
    writeFile(join(outDir, "index.html"), htmlReport(run)),
  ]);
}
