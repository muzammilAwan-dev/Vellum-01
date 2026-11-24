// Tiny CSV writer (RFC 4180 quoting) + browser download, for table exports.
const cell = (v) => {
  const s = v == null ? "" : String(v);
  // Guard against spreadsheet formula injection from user-provided text.
  const safe = /^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const toCsv = (header, rows) => [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

export const downloadCsv = (filename, header, rows) => {
  const url = URL.createObjectURL(new Blob(["\ufeff", toCsv(header, rows)], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
