# Browser smoke test (no Vite, no npm install needed)

Renders the real app (real route table, `RequireAuth`/`RequireRole`/`SubjectGate`, `Layout`,
every page, the mock server) in headless Chromium and fails on any render crash, console
error or empty page. It exists because the integration suite (`tests/`) runs in plain Node and
never renders a component, so a missing prop or context field only shows up in the browser.

Stand-ins are used for packages that may not be installed (`react-router`, `lucide-react`,
`recharts`, `class-variance-authority`, `tailwind-merge`, `clsx`). **No stylesheet is loaded**, so
this checks behaviour, not layout: widths, overflow and wrapping still need a real browser.

```bash
cd tools/smoke
export NODE_PATH=<dir containing react and react-dom>       # e.g. the project's node_modules
export ESBUILD=<path to an esbuild binary>
./build.sh                                  # → bundle.js
ROLES=admin,teacher,student W=1280 node run.mjs    # every page of every role (add W=390 for phone width)
W=1280 node interact.mjs                     # clicks through LMS, discussion, sidebar
W=1280 node profile-check.mjs                # F13a: sidebar link, edit/save/validation, theme sync, all 3 roles
# (if build.sh is not executable after unzipping: `bash build.sh`)
```
Env: `PLAYWRIGHT` (path to the playwright package), `CHROME` (chromium executable), `ROLES`, `W`/`H`.
`SRC=<dir> OUT=<file> ./build.sh` bundles another copy of `src/` (useful for checking a bug is caught).
Run `run.mjs` one role at a time if a single command has a time limit (about 40 s per role).
