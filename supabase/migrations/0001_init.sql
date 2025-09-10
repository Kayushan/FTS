-- Supabase schema for Offline → Cloud sync
-- Creates: users, transactions, debts, borrows, user_insights

-- Users (profiles) referencing auth.users
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.users disable row level security;

-- Transactions (income/expense)
create table if not exists public.transactions (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  id_client text not null,
  date date not null,
  type text not null check (type in ('income','expense')),
  amount numeric(14,2) not null check (amount >= 0),
  category text not null,
  note text,
  created_at_client timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, id_client)
);

create index if not exists idx_transactions_user_date on public.transactions(user_id, date);

alter table public.transactions disable row level security;

-- Debts (you are owed)
create table if not exists public.debts (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  id_client text not null,
  person text not null,
  amount numeric(14,2) not null check (amount >= 0),
  note text,
  status text not null check (status in ('unpaid','paid')),
  created_at_client timestamptz,
  updated_at_client timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, id_client)
);

create index if not exists idx_debts_user on public.debts(user_id);

alter table public.debts disable row level security;

-- Borrows (you owe)
create table if not exists public.borrows (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  id_client text not null,
  person text not null,
  amount numeric(14,2) not null check (amount >= 0),
  note text,
  due_date date,
  status text not null check (status in ('unpaid','paid')),
  created_at_client timestamptz,
  updated_at_client timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, id_client)
);

create index if not exists idx_borrows_user on public.borrows(user_id);

alter table public.borrows disable row level security;

-- User insights (for AI summaries, later)
create table if not exists public.user_insights (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  period text not null,
  summary text,
  data jsonb,
  created_at timestamptz not null default now()
);

alter table public.user_insights disable row level security;


