# GSY Investor Monitor

Executive financial monitoring for GSY Investment Group: investor receipts, payouts, commissions, cash and CRM pipeline, on desktop and mobile.

> **Preview build:** runs on generated **sample data** with a demo sign-in. No real investor data is included in this repository.

## Run locally

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # production build in dist/
```

## Stack
- Vite + React 19 + TypeScript, Tailwind CSS v4, Recharts
- Planned: Supabase (database, auth, row-level security), Vercel hosting, **Gemini 2.5 Flash on Vertex AI** for the assistant (server-side, read-only tools)

## Structure
| Path | What it holds |
|---|---|
| `src/data/types.ts` | The source tables (one per Excel sheet) |
| `src/data/schedule.ts` | Payout and commission schedules generated from contracts |
| `src/data/engine.ts` | All business calculations and filters |
| `src/data/explore.ts` | Measures × dimensions model for the Report Builder and AI answers |
| `src/data/seed.ts` | Sample data generator (replaced by the Excel/Supabase import) |
| `src/pages/` | Screens: Home, payouts, investors, commissions, analytics, AI, admin |

## Deploy (Vercel)
Import the repository in Vercel. `vercel.json` sets the Vite build and SPA routing.
