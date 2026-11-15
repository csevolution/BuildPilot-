-- Run in Supabase SQL Editor. RLS is mandatory for all user data.
create extension if not exists pgcrypto;
create table if not exists public.projects (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (char_length(trim(name)) between 1 and 160),
 address text,
 status text not null default 'planning' check(status in ('planning','active','on_hold','completed','archived')),
 budget numeric(14,2) not null default 0 check (budget >= 0),
 start_date date,
 end_date date,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint valid_dates check (end_date is null or start_date is null or end_date >= start_date)
);
create index if not exists projects_user_created_idx on public.projects(user_id,created_at desc);
alter table public.projects enable row level security;
create policy "Read own projects" on public.projects for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own projects" on public.projects for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own projects" on public.projects for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own projects" on public.projects for delete to authenticated using ((select auth.uid()) = user_id);
create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$begin new.updated_at = now();return new;end;$$;
create trigger projects_updated_at before update on public.projects for each row execute function public.set_updated_at();
