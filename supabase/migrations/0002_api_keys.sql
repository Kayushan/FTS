-- API keys storage (no RLS as requested)
create table if not exists public.api_keys (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  key text not null,
  priority int not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists idx_api_keys_user_priority on public.api_keys(user_id, priority);

alter table public.api_keys disable row level security;


