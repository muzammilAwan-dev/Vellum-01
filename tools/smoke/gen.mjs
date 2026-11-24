// Generates stub modules for the icon and chart packages from the names the app imports.
import fs from "node:fs";
import path from "node:path";
const HERE = import.meta.dirname;
const SRC = process.env.SRCDIR || path.resolve(HERE, "../../src");
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? walk(path.join(d, x.name)) : [path.join(d, x.name)]));
const files = walk(SRC).filter((f) => /\.jsx?$/.test(f));
const names = (mod) => {
  const out = new Set();
  for (const f of files) {
    const s = fs.readFileSync(f, "utf8");
    for (const m of s.matchAll(new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*"${mod}"`, "gs")))
      m[1].split(",").map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean).forEach((n) => out.add(n));
  }
  return [...out];
};
const icons = names("lucide-react");
fs.writeFileSync(path.join(HERE, "stubs/lucide.jsx"), `import React from "react";\nconst mk = (name) => (p) => <svg data-icon={name} width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={p.className} aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="4" /></svg>;\n${icons.map((n) => `export const ${n} = mk("${n}");`).join("\n")}\n`);
const charts = names("recharts");
fs.writeFileSync(path.join(HERE, "stubs/recharts.jsx"), `import React from "react";\nconst box = (n) => ({ children, height }) => n === "ResponsiveContainer" ? <div data-chart={n} style={{ height: typeof height === "number" ? height : 220, border: "1px dashed currentColor", opacity: 0.35, display: "grid", placeItems: "center", fontSize: 12 }}>chart placeholder (real chart on your machine)</div> : <div data-chart={n}>{typeof children === "function" ? null : children}</div>;\n${charts.map((n) => `export const ${n} = box("${n}");`).join("\n")}\n`);
console.log("icons", icons.length, "charts", charts.length);
