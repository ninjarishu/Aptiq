create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  planned_duration integer not null check (planned_duration > 0),
  actual_duration integer not null default 0 check (actual_duration >= 0),
  session_type text not null default 'focus' check (session_type in ('focus','break')),
  status text not null default 'running' check (status in ('running','completed','interrupted','cancelled')),
  interruption_count integer not null default 0 check (interruption_count >= 0),
  created_at timestamptz not null default now()
);
create index if not exists focus_user_started_idx on public.focus_sessions(user_id,started_at desc);
alter table public.focus_sessions enable row level security;
grant select,insert,update,delete on public.focus_sessions to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='focus_sessions' and policyname='focus owner access') then
    create policy "focus owner access" on public.focus_sessions for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
  end if;
end $$;
