// `npm test` — runs tests/integration.test.js in plain Node against the fake
// backend (src/mocks). The suite imports the app's API layer and domain rules via
// the `@/` alias, so it is bundled first with esbuild and then executed.
//
// One-time setup: `npm i -D esbuild` (not a runtime dependency; only used here).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

let esbuild;
try {
  esbuild = await import("esbuild");
} catch {
  console.error("The tests are bundled with esbuild, which is not installed.\nRun once:  npm i -D esbuild");
  process.exit(2);
}

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "vellum-tests-"));
const outfile = path.join(outDir, "integration.mjs");
try {
  await esbuild.build({
    entryPoints: [path.join(root, "tests/integration.test.js")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    alias: { "@": path.join(root, "src") },
    loader: { ".js": "jsx" },
    define: { "import.meta.env": JSON.stringify({ DEV: false, VITE_USE_MOCK: "true" }) },
    logLevel: "error",
  });
} catch {
  process.exit(1); // esbuild already printed the error
}

// cwd = project root: one test reads source files (the context guard)
const run = spawnSync(process.execPath, [outfile], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
fs.rmSync(outDir, { recursive: true, force: true });

const lines = (run.stdout ?? "").split("\n");
const failed = lines.filter((l) => l.startsWith("FAIL"));
const passed = lines.filter((l) => l.startsWith("ok")).length;
failed.forEach((l) => console.log(l));
if (run.stderr?.trim()) console.error(run.stderr.trim());
console.log(`\n${passed} passed, ${failed.length} failed`);
process.exit(failed.length || run.status ? 1 : 0);
