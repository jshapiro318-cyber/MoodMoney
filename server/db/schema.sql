-- MoodMoney Database Schema
-- Run this in your Supabase SQL editor to set up the database.
-- Supabase Auth handles the auth.users table automatically.

-- ─── User Profiles ────────────────────────────────────────────────────────────
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  monthly_income numeric(10, 2),
  current_savings numeric(10, 2) default 0,
  savings_goal text,                   -- e.g. "Vacation to Japan"
  savings_target_amount numeric(10, 2),
  personality_type text,               -- One of the 7 types
  personality_data jsonb,              -- Full personality result object
  personality_answers jsonb,           -- Onboarding questionnaire answers
  bank_connected boolean default false,
  onboarding_completed boolean default false,
  is_premium boolean default false,
  premium_expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-update updated_at on every row change
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger user_profiles_updated_at
  before update on user_profiles
  for each row execute procedure update_updated_at();

-- ─── Plaid Items (bank connections) ───────────────────────────────────────────
create table if not exists public.plaid_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,
  item_id text not null,
  access_token text not null,          -- Store encrypted in production
  institution_name text,
  institution_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Plaid access tokens must never be exposed — restrict to service role only
alter table plaid_items enable row level security;
create policy "Service role only" on plaid_items
  using (false);  -- All access goes through server API with service role key

-- ─── Transactions ─────────────────────────────────────────────────────────────
create table if not exists public.transactions (
  id text primary key,                  -- Plaid transaction_id
  user_id uuid references auth.users(id) on delete cascade,
  date date not null,
  name text,
  amount numeric(10, 2),               -- Positive = spending, negative = income
  category text,
  subcategory text,
  merchant text,
  pending boolean default false,
  channel text,
  synced_at timestamptz default now()
);

create index if not exists transactions_user_date on transactions(user_id, date desc);

alter table transactions enable row level security;
create policy "Users see own transactions" on transactions
  for select using (auth.uid() = user_id);

-- ─── Spending Analyses (cached Claude output) ─────────────────────────────────
create table if not exists public.spending_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,
  analysis jsonb not null,
  analyzed_at timestamptz default now()
);

alter table spending_analyses enable row level security;
create policy "Users see own analysis" on spending_analyses
  for select using (auth.uid() = user_id);

-- ─── Chat Messages ────────────────────────────────────────────────────────────
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  role text check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);

create index if not exists chat_messages_user on chat_messages(user_id, created_at desc);

alter table chat_messages enable row level security;
create policy "Users see own messages" on chat_messages
  for select using (auth.uid() = user_id);

-- ─── Gamification ─────────────────────────────────────────────────────────────
create table if not exists public.gamification (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,
  xp integer default 0,
  current_streak integer default 0,
  longest_streak integer default 0,
  last_no_spend_date date,
  badges text[] default '{}',
  weekly_challenges_completed text[] default '{}',
  updated_at timestamptz default now()
);

alter table gamification enable row level security;
create policy "Users see own gamification" on gamification
  for select using (auth.uid() = user_id);

-- ─── Grant service role full access (server uses service role key) ─────────────
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
