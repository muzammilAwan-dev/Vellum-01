#!/bin/bash
# Bundles the REAL app (routes, layout, pages, mock server) with stand-ins for the
# few npm packages that may not be installed (router, icons, charts, class helpers).
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SRC="${SRC:-$ROOT/src}"
OUT="${OUT:-$HERE/bundle.js}"
ESB="${ESBUILD:-esbuild}"
cd "$HERE" && SRCDIR="$SRC" node gen.mjs >/dev/null
"$ESB" entry.jsx --bundle --format=iife --platform=browser --outfile="$OUT" \
  --loader:.js=jsx --jsx=automatic --log-level=error \
  --alias:@="$SRC" \
  --alias:react-router="$HERE/stubs/react-router.jsx" \
  --alias:lucide-react="$HERE/stubs/lucide.jsx" \
  --alias:recharts="$HERE/stubs/recharts.jsx" \
  --alias:react-avatar-editor="$HERE/stubs/react-avatar-editor.jsx" \
  --alias:class-variance-authority="$HERE/stubs/cva.js" \
  --alias:tailwind-merge="$HERE/stubs/twmerge.js" \
  --alias:clsx="$HERE/stubs/misc.js" \
  --define:import.meta.env='{"DEV":false,"PROD":false,"VITE_USE_MOCK":"true","BASE_URL":"/"}' \
  --define:process.env.NODE_ENV='"development"'
echo built
