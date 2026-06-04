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
