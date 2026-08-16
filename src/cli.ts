#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseCassette, verifyCassette } from "./cassette.js";
import { createDemoRun } from "./demo.js";
import { writeArtifacts } from "./report.js";
import { recordedOutputAdapters, replay } from "./replay.js";

async function main(args: string[]): Promise<number> {
  const [command = "help", ...rest] = args;
  if (command === "demo") {
    if (rest.length > 1 || rest[0]?.startsWith("-") === true) throw new Error("usage: runmirror demo [OUT]");
    const out = rest[0] ?? "artifacts/demo";
    const run = await createDemoRun();
    await writeArtifacts(out, run);
    console.log(JSON.stringify({ out, events: run.cassette.events.length, replay: run.replay, driftProbe: run.driftProbe.divergence }));
    return 0;
  }
  if (command === "verify") {
    if (rest.length !== 1 || rest[0]?.startsWith("-") === true) throw new Error("usage: runmirror verify CASSETTE.jsonl");
    const path = rest[0];
    if (path === undefined) throw new Error("usage: runmirror verify CASSETTE.jsonl");
    const verification = verifyCassette(parseCassette(await readFile(path, "utf8")));
    console.log(JSON.stringify(verification));
    return verification.valid ? 0 : 1;
  }
  if (command === "replay") {
    if (rest.length !== 1 || rest[0]?.startsWith("-") === true) throw new Error("usage: runmirror replay CASSETTE.jsonl");
    const path = rest[0];
    if (path === undefined) throw new Error("usage: runmirror replay CASSETTE.jsonl");
    const result = await replay(parseCassette(await readFile(path, "utf8")), recordedOutputAdapters());
    console.log(JSON.stringify(result));
    return result.integrity.valid && result.divergence === null ? 0 : 1;
  }
  if (["help", "--help", "-h"].includes(command) && rest.length > 0) throw new Error("help does not accept operands");
  console.log("runmirror demo [OUT]\nrunmirror verify CASSETTE.jsonl\nrunmirror replay CASSETTE.jsonl");
  return command === "help" || command === "--help" || command === "-h" ? 0 : 2;
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
