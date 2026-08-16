#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseCassette, verifyCassette } from "./cassette.js";
import { createDemoRun } from "./demo.js";
import { writeArtifacts } from "./report.js";
import { recordedOutputAdapters, replay } from "./replay.js";

const USAGE = "runmirror demo [OUT]\nrunmirror verify CASSETTE.jsonl\nrunmirror replay CASSETTE.jsonl";
type CommandHandler = (operands: string[]) => Promise<number>;

const demo: CommandHandler = async (operands) => {
  if (operands.length > 1 || operands[0]?.startsWith("-") === true) throw new Error("usage: runmirror demo [OUT]");
  const out = operands[0] ?? "artifacts/demo";
  const run = await createDemoRun();
  await writeArtifacts(out, run);
  console.log(JSON.stringify({ out, events: run.cassette.events.length, replay: run.replay, driftProbe: run.driftProbe.divergence }));
  return 0;
};

const verify: CommandHandler = async (operands) => {
  if (operands.length !== 1 || operands[0]?.startsWith("-") === true) throw new Error("usage: runmirror verify CASSETTE.jsonl");
  const inputPath = operands[0];
  if (inputPath === undefined) throw new Error("usage: runmirror verify CASSETTE.jsonl");
  const verification = verifyCassette(parseCassette(await readFile(inputPath, "utf8")));
  console.log(JSON.stringify(verification));
  return verification.valid ? 0 : 1;
};

const replayCassette: CommandHandler = async (operands) => {
  if (operands.length !== 1 || operands[0]?.startsWith("-") === true) throw new Error("usage: runmirror replay CASSETTE.jsonl");
  const inputPath = operands[0];
  if (inputPath === undefined) throw new Error("usage: runmirror replay CASSETTE.jsonl");
  const result = await replay(parseCassette(await readFile(inputPath, "utf8")), recordedOutputAdapters());
  console.log(JSON.stringify(result));
  return result.integrity.valid && result.divergence === null ? 0 : 1;
};

const help: CommandHandler = async (operands) => {
  if (operands.length > 0) throw new Error("help does not accept operands");
  console.log(USAGE);
  return 0;
};

const COMMANDS: ReadonlyMap<string, CommandHandler> = new Map([
  ["demo", demo],
  ["verify", verify],
  ["replay", replayCassette],
  ["help", help],
  ["--help", help],
  ["-h", help],
]);

async function main(args: string[]): Promise<number> {
  const [requestedCommand = "help", ...operands] = args;
  const handler = COMMANDS.get(requestedCommand);
  if (handler === undefined) {
    console.log(USAGE);
    return 2;
  }
  return handler(operands);
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
