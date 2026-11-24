# UI audit tooling
See `docs/ui-audit.md`. Quick start (from the project root):

    bash tools/smoke/build.sh
    TAILWIND=/path/to/node_modules/tailwindcss node tools/audit/build-css.mjs
    ROLE=admin node tools/audit/capture.mjs        # admin | teacher | student | public

Output: `tools/audit/shots/<role>/{light,dark}/*.png`, `report.json`, `findings.md` (generated; git-ignored).
Env: `PLAYWRIGHT` (path to the playwright package), `CHROME` (Chromium binary), `WIDTHS`, `THEMES`, `ONLY`, `OUT`.
In the sandbox, icons are placeholder squares, charts are placeholder boxes and fonts fall back; see the doc.

## Live audit (preferred): real app, real fonts/icons/charts
    npm run audit                       # ROLE=admin by default; ROLE=teacher|student|public
    ROLE=teacher WIDTHS=390,1280 THEMES=light ZIP=0 npm run audit
Starts its own Vite dev server on :5199 (or uses `BASE_URL`), signs in through the login page, and writes `tools/audit/live/<role>/`
(`light|dark/*.jpg`, `aria/*.yml`, `report.json`, `findings.md`) plus `tools/audit/audit-<role>.zip`.
Per page: screenshots at 6 widths × 2 themes, axe-core (WCAG 2.2 AA + best practice), tap targets, tiny text, unnamed controls, iOS input zoom,
font loading, and at 1280 px a Tab walk and ARIA snapshot. `BROWSER=webkit|firefox` needs `npx playwright install webkit firefox`.
