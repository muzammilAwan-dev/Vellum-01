// Compiles src/styles/index.css with Tailwind v4's own compiler (no Vite, no network) into tools/audit/app.css,
// so headless screenshots look like the real app. Candidates = every token found in src/ and index.html.
// Usage: TAILWIND=/path/to/node_modules/tailwindcss node tools/audit/build-css.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TW = process.env.TAILWIND ?? path.resolve("node_modules/tailwindcss");
const { compile } = await import(pathToFileURL(path.join(TW, "dist/lib.mjs")).href);
const cssPath = path.resolve("src/styles/index.css");
const css = fs.readFileSync(cssPath, "utf8");

const compiler = await compile(css, {
  base: path.dirname(cssPath),
  loadStylesheet: async (id, base) => {
    if (id === "tailwindcss") return { path: path.join(TW, "index.css"), base: TW, content: fs.readFileSync(path.join(TW, "index.css"), "utf8") };
    const file = id.startsWith("tailwindcss/") ? path.join(TW, id.slice("tailwindcss/".length)) : path.resolve(base, id);
    return { path: file, base: path.dirname(file), content: fs.readFileSync(file, "utf8") };
  },
});

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? walk(path.join(d, x.name)) : [path.join(d, x.name)]));
const files = [...walk("src").filter((f) => /\.(jsx?|css|html)$/.test(f)), "index.html"];
const candidates = new Set();
for (const f of files) for (const t of fs.readFileSync(f, "utf8").split(/[\s"'`<>{};]+/)) if (t && t.length < 120) candidates.add(t);

const out = compiler.build([...candidates]);
fs.writeFileSync("tools/audit/app.css", out);
console.log(`app.css ${Math.round(out.length / 1024)} KB from ${candidates.size} tokens`);
