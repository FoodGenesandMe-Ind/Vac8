# Vac8

Local AI vacation planner with Agatha (side chat), working plan, suggestions, and web-search price watches.

## Setup

```bash
npm install
cp .env.example .env
# Add ANTHROPIC_API_KEY or OPENAI_API_KEY, and SERPER_API_KEY for search
npm run test:keys   # verify all keys
npm run dev
```

If ports are stuck (`EADDRINUSE` on 3847 or Vite picks 5174+):
```bash
npm run dev:stop
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

Uses `npm` (not `pnpm`). Install pnpm only if you prefer it: `npm install -g pnpm`.

Open http://localhost:5173

## Stack

- React + Vite (UI)
- Hono + SQLite (API, `data/vac8.db`)
- Anthropic or OpenAI for Agatha
- Serper for web search
- node-cron + node-notifier for price checks (while server runs)

## Phase 2

Swap `server/price-provider.ts` for Amadeus/Duffel; add email/SMS alerts.
