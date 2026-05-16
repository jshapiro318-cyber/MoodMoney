-- Run this in your Supabase SQL editor if you haven't run schema.sql yet,
-- or if you're seeing RLS / permission errors.

-- User Profiles
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  monthly_income numeric(10, 2),
  current_savings numeric(10, 2) default 0,
  savings_goal text,
  savings_target_amount numeric(10, 2),
  personality_type text,
  personality_data jsonb,
  personality_answers jsonb,
  bank_connected boolean default false,
  onboarding_completed boolean default false,
  is_premium boolean default false,
  premium_expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Disable RLS on user_profiles so the server's service role key can write freely
alter table public.user_profiles disable row level security;

-- Spending Analyses
create table if not exists public.spending_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,
  analysis jsonb not null,
  analyzed_at timestamptz default now()
);
alter table public.spending_analyses disable row level security;

-- Transactions
create table if not exists public.transactions (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  date date not null,
  name text,
  amount numeric(10, 2),
  category text,
  subcategory text,
  merchant text,
  pending boolean default false,
  channel text,
  synced_at timestamptz default now()
);
alter table public.transactions disable row level security;

-- Plaid Items
create table if not exists public.plaid_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,
  item_id text not null,
  access_token text not null,
  institution_name text,
  institution_id text,
  created_at timestamptz default now()
);
alter table public.plaid_items disable row level security;

-- Chat Messages
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  role text check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);
alter table public.chat_messages disable row level security;

-- Gamification
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
alter table public.gamification disable row level security;

-- Grant service role full access
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all tables in schema public to anon;
grant all on all tables in schema public to authenticated;
