#!/usr/bin/env node
// UI audit: dependency-free scan of src/**/*.jsx for common UI/UX problems.
//   node scripts/ui-audit.mjs                 summary + first 6 hits per rule
//   node scripts/ui-audit.mjs --rule NAME     every hit for one rule
//   node scripts/ui-audit.mjs --file PATH     only that file/folder (substring match)
//   node scripts/ui-audit.mjs --json          machine-readable
// Hits are *leads*, not verdicts — open the file before changing anything.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const onlyRule = arg("--rule");
const onlyFile = arg("--file");
const asJson = args.includes("--json");

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".jsx") ? [p] : [];
  });
const files = walk("src").filter((f) => !onlyFile || f.includes(onlyFile));

const RULES = {
  "outline-removed": "outline-none with no other focus indicator (ring / border / shadow) — keyboard users lose track of focus",
  "hardcoded-color": "raw hex / palette color instead of a semantic token (text-ink, bg-surface, text-danger …)",
  "same-size-wh": "w-N h-N with equal N → use size-N",
  "viewport-height": "100vh / h-screen / min-h-screen → use dvh (mobile browser bars)",
  "icon-button-no-label": "icon-only <button> without aria-label / title",
  "div-onclick": "clickable <div>/<span> (not keyboard accessible) → use <button>",
  "img-no-alt": "<img> without alt",
  "small-target": "interactive element smaller than 24×24 px (WCAG 2.2 target size, AA)",
  "dynamic-class-fragment": "class name built from a template fragment (Tailwind can't see it): bg-${x}",
  "inline-style": "style={{…}} (prefer tokens/utilities unless the value is truly dynamic)",
  "positive-tabindex": "tabIndex > 0 breaks natural focus order",
  "target-blank-no-rel": 'target="_blank" without rel="noopener noreferrer"',
};
const hits = Object.fromEntries(Object.keys(RULES).map((k) => [k, []]));
const lineOf = (src, idx) => src.slice(0, idx).split("\n").length;
const add = (rule, file, src, idx, note = "") =>
  hits[rule].push({ file, line: lineOf(src, idx), note: note || src.slice(idx, idx + 90).split("\n")[0].trim() });

const fontSizes = {};
for (const file of files) {
  const src = readFileSync(file, "utf8");
  let m;

  // className strings (plain "…" and `…`), per string
  const cls = /className=(?:"([^"]*)"|\{`([^`]*)`\})/g;
  while ((m = cls.exec(src))) {
    const c = m[1] ?? m[2];
    const at = m.index;
    if (/(^|\s)(focus:)?outline-none/.test(c) && !/focus(?:-visible|-within)?:(?:ring|border|shadow|outline-(?:2|4)|bg)/.test(c)) add("outline-removed", file, src, at);
    if (/#[0-9a-fA-F]{3,8}\b/.test(c) || /\b(?:text|bg|border|ring|fill|stroke)-(?:red|blue|green|yellow|orange|amber|purple|pink|indigo|violet|emerald|teal|cyan|sky|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/.test(c))
      add("hardcoded-color", file, src, at);
    const wh = /\bw-(\d+(?:\.\d+)?) h-\1\b|\bh-(\d+(?:\.\d+)?) w-\2\b/.exec(c);
    if (wh) add("same-size-wh", file, src, at, wh[0]);
    if (/(?:^|[\s:])(?:h|min-h|max-h)-screen\b|\b100vh\b/.test(c)) add("viewport-height", file, src, at);
    if (/-\$\{/.test(c)) add("dynamic-class-fragment", file, src, at);
    for (const f of c.matchAll(/\btext-\[(\d+(?:\.\d+)?)px\]/g)) fontSizes[f[1]] = (fontSizes[f[1]] ?? 0) + 1;
  }

  for (const t of src.matchAll(/<button\b([^>]*)>\s*(<[A-Z][\w.]*\b[^>]*\/>)\s*<\/button>/g))
    if (!/aria-label|title=|aria-labelledby/.test(t[1])) add("icon-button-no-label", file, src, t.index);
  for (const t of src.matchAll(/<(?:div|span|li|td|tr)\b[^>]*\sonClick=/g))
    if (!/role=|<button/.test(t[0])) add("div-onclick", file, src, t.index);
  for (const t of src.matchAll(/<img\b(?![^>]*\balt=)[^>]*>/g)) add("img-no-alt", file, src, t.index);
  for (const t of src.matchAll(/<(button|a)\b[^>]*className="[^"]*\b(?:size-(?:3|4|5)|(?:h|w)-(?:3|4|5))\b[^"]*"/g))
    if (!/\bp[xy]?-\d|min-[hw]-|\bsize-(?:6|7|8|9|10)\b|\b[hw]-(?:6|7|8|9|10|11|12)\b/.test(t[0])) add("small-target", file, src, t.index);
  for (const t of src.matchAll(/style=\{\{/g)) add("inline-style", file, src, t.index);
  for (const t of src.matchAll(/tabIndex=\{?["']?([1-9]\d*)/g)) add("positive-tabindex", file, src, t.index);
  for (const t of src.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) if (!/rel="[^"]*noopener/.test(t[0])) add("target-blank-no-rel", file, src, t.index);
}

let css = "";
try { css = readFileSync("src/styles/index.css", "utf8"); } catch { /* no css */ }
const global = {
  "reduced-motion rule in index.css": /prefers-reduced-motion/.test(css),
  "focus-visible base style in index.css": /focus-visible/.test(css),
};

const out = {
  files: files.length,
  rules: Object.fromEntries(Object.entries(hits).map(([k, v]) => [k, { count: v.length, why: RULES[k], hits: onlyRule === k ? v : v.slice(0, 6) }])),
  fontSizeDrift: Object.entries(fontSizes).sort((a, b) => Number(a[0]) - Number(b[0])).map(([px, n]) => `${px}px×${n}`),
  global,
};
if (asJson) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }

console.log(`UI audit — ${files.length} files${onlyFile ? ` matching "${onlyFile}"` : ""}\n`);
for (const [k, r] of Object.entries(out.rules)) {
  if (onlyRule && k !== onlyRule) continue;
  console.log(`${String(r.count).padStart(4)}  ${k} — ${r.why}`);
  r.hits.forEach((h) => console.log(`        ${h.file}:${h.line}  ${h.note}`));
  if (!onlyRule && r.count > r.hits.length) console.log(`        … +${r.count - r.hits.length} more (--rule ${k})`);
}
if (!onlyRule) {
  console.log(`\narbitrary text sizes in use: ${out.fontSizeDrift.join("  ")}`);
  Object.entries(global).forEach(([k, v]) => console.log(`${v ? "ok " : "MISSING"}  ${k}`));
}
