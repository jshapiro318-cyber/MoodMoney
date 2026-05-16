# MoodMoney 💸

> Your AI money therapist. Understand *why* you spend, not just what you spend on.

## Stack
- **Frontend**: React + Vite + Tailwind CSS + Framer Motion
- **Backend**: Node.js + Express
- **Database**: Supabase (Postgres + Auth)
- **AI**: Anthropic Claude (`claude-sonnet-4-20250514`)
- **Bank data**: Plaid API (sandbox mode for development)

## Setup

### 1. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

### 2. Set up environment variables

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Fill in:
- `ANTHROPIC_API_KEY` — get from https://console.anthropic.com
- `SUPABASE_URL` + `SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` — Supabase project settings
- `PLAID_CLIENT_ID` + `PLAID_SECRET` — Plaid dashboard (use sandbox environment)

### 3. Set up the database

1. Create a Supabase project
2. Open the SQL editor and run `server/db/schema.sql`

### 4. Run

```bash
# Terminal 1 — backend
cd server && npm run dev

# Terminal 2 — frontend
cd client && npm run dev
```

Open http://localhost:5173

## Features

| Feature | Description |
|---|---|
| Onboarding | Plaid connect → personality quiz → AI personality reveal |
| Dashboard | Spending insight cards, emotional score, proactive alerts |
| Afford This | Budget score, goal delay calc, 5-yr opportunity cost |
| Simulator | "What if" scenarios with animated timeline |
| AI Chat | Financial therapist with your full spending context |
| Gamification | XP, streaks, badges, levels |

## Monetization
- **Free**: Basic insights, 10 AI messages/month
- **Premium ($9.99/mo)**: Unlimited AI coaching, advanced analysis
