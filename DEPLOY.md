# Deploying MoodMoney

## Backend → Railway

1. Go to [railway.app](https://railway.app) and sign up
2. Click **New Project** → **Deploy from GitHub repo**
3. Connect your GitHub account and select this repo
4. Set the **root directory** to `/server`
5. Add these environment variables in Railway dashboard:
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `PLAID_CLIENT_ID`
   - `PLAID_SECRET`
   - `PLAID_ENV=sandbox`
   - `NODE_ENV=production`
   - `CLIENT_URL=https://your-vercel-app.vercel.app`
6. Railway will give you a URL like `https://moodmoney-production.railway.app`

## Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) and sign up
2. Click **Add New Project** → import your GitHub repo
3. Set **root directory** to `client`
4. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Update `client/vercel.json` — replace `your-railway-app.railway.app` with your actual Railway URL
6. Deploy — Vercel gives you a URL like `https://moodmoney.vercel.app`

## Final step

Update the `CLIENT_URL` env var in Railway to your Vercel URL so CORS works.
