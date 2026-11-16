create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  description text not null default '',
  subject text not null default '',
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  difficulty text not null default 'medium' check (difficulty in ('low','medium','high')),
  estimated_duration integer not null default 30 check (estimated_duration > 0),
  deadline timestamptz,
  status text not null default 'pending' check (status in ('pending','completed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists tasks_user_status_idx on public.tasks(user_id,status);
create index if not exists tasks_user_deadline_idx on public.tasks(user_id,deadline);

create table if not exists public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  is_completed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists subtasks_user_task_idx on public.subtasks(user_id,task_id);

create table if not exists public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  title text not null check (length(trim(title)) > 0),
  start_time timestamptz not null,
  end_time timestamptz not null,
  block_type text not null default 'task' check (block_type in ('task','break','custom')),
  is_manually_created boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists schedule_user_start_idx on public.schedule_blocks(user_id,start_time);

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

create table if not exists public.interruption_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  focus_session_id uuid not null references public.focus_sessions(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  reason text
);
create index if not exists interruptions_user_session_idx on public.interruption_records(user_id,focus_session_id);

create table if not exists public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  focus_duration integer not null default 25 check (focus_duration > 0),
  break_duration integer not null default 5 check (break_duration > 0),
  theme text not null default 'light',
  sound_enabled boolean not null default true,
  notification_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();
create trigger schedule_blocks_touch before update on public.schedule_blocks for each row execute function public.touch_updated_at();
create trigger preferences_touch before update on public.user_preferences for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,display_name,email) values(new.id,coalesce(new.raw_user_meta_data->>'display_name',''),coalesce(new.email,''));
  insert into public.user_preferences(user_id) values(new.id);
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;
alter table public.schedule_blocks enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.interruption_records enable row level security;
alter table public.user_preferences enable row level security;

create policy "profile owner access" on public.profiles for all to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "task owner access" on public.tasks for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "subtask owner access" on public.subtasks for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "schedule owner access" on public.schedule_blocks for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "focus owner access" on public.focus_sessions for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "interruption owner access" on public.interruption_records for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "preferences owner access" on public.user_preferences for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant usage on schema public to authenticated;
grant select,insert,update,delete on public.profiles,public.tasks,public.subtasks,public.schedule_blocks,public.focus_sessions,public.interruption_records,public.user_preferences to authenticated;
