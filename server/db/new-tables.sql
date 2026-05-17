-- Plaid bank connections
create table if not exists public.plaid_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,
  item_id text unique not null,
  access_token text not null,
  institution_name text,
  institution_id text,
  created_at timestamptz default now()
);
alter table public.plaid_items disable row level security;

-- Savings goals
create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  target_amount decimal not null,
  current_amount decimal default 0,
  emoji text default '🎯',
  color text default '#f97316',
  deadline date,
  created_at timestamptz default now()
);
alter table public.savings_goals disable row level security;

grant all on public.plaid_items to service_role, authenticated, anon;
grant all on public.savings_goals to service_role, authenticated, anon;
