# Decoded — agent notes

## What this is

A TanStack Start (Vite + React 19) app that analyzes Terms & Conditions into
plain-language, evidence-linked findings. Server functions in
`src/lib/decoded.functions.ts` call the Google Gemini API directly; the browser
never sees the API key.

## Non-obvious setup

- **Source must live under `src/`.** `tsconfig.json` maps `@/*` to `./src/*` and
  only includes `src/**`. Imports use `@/lib/...`, `@/components/...`,
  `@/assets/...`. Routes live in `src/routes/` (`__root.tsx`, `index.tsx`);
  `routeTree.gen.ts`, `router.tsx`, `start.ts`, and `styles.css` sit at `src/`
  root. `styles.css` scans Tailwind classes via `@source "../src"`.
- **Run command:** `vite dev` (from `package.json`). Compose runs it on
  `0.0.0.0:3000`. Vite >= 6.1 accepts the platform-provided preview host through
  `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` (passed through in compose).
- **AI provider:** `GEMINI_API_KEY` (Google AI Studio). It is read from
  `process.env` inside server functions. The app boots and the UI / PDF text
  extraction work without it; only AI analysis is disabled. A development
  placeholder lives in `.env.base44-defaults`; the real value is delivered to
  `/run/base44/app.env` (listed last in compose so it wins).
- **No database or other services.** Single Node service, no migrations/seeds.

## Verify it works

```bash
docker compose -f docker-compose.base44.yml up -d
curl -s --compressed http://localhost:3000/ | grep -o "<title>[^<]*</title>"
```

Served HTML references unhashed source (`/src/styles.css`,
`/@tanstack-start/...`) — that confirms the dev server, not a prebuilt bundle.
The Vite SSR log prints `(ssr) connected.` when the server runtime is live.

## Known warnings (harmless)

- `createServerFn().inputValidator() is deprecated. Use ...validator() instead.`
  — appears on startup; the app runs fine.
