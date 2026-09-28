-- ============================================================
-- QR Attendance — Supabase schema (Phase 3)
--
-- HOW TO RUN:
--   1. Open Supabase Dashboard -> SQL Editor
--   2. Paste the ENTIRE file
--   3. Click "Run"
--   4. Verify profiles / events / attendance appear in Table Editor
--
-- Safe to re-run: every statement below is idempotent
-- (create table if not exists / drop policy if exists /
--  create or replace function / drop trigger if exists).
--
-- ORDER MATTERS: all three tables are created BEFORE any policy,
-- because the "Teachers can view profiles of their attendees" policy
-- queries public.attendance and public.events in its USING clause.
-- Creating that policy first is what caused:
--   ERROR 42P01: relation "public.attendance" does not exist
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. TABLES (all three, before any policy that references them)
-- ------------------------------------------------------------

-- profiles: one row per signed-up user (Supabase Auth + role)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'student' check (role in ('student', 'teacher')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- events: one attendance event; event_code is what the QR encodes
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_code text not null unique,
  title text not null,
  start_time text,
  end_time text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- attendance: one row per student per event (anti-double-scan)
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  unique (student_id, event_id)
);

-- ------------------------------------------------------------
-- 2. ROW LEVEL SECURITY (enabled on every table)
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.attendance enable row level security;

-- ------------------------------------------------------------
-- 3. profiles policies
-- ------------------------------------------------------------

drop policy if exists "Profiles are viewable by owner" on public.profiles;
create policy "Profiles are viewable by owner"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Teachers can read the profiles of students who attended their events
-- (needed to show attendee names in the teacher's History view).
drop policy if exists "Teachers can view profiles of their attendees" on public.profiles;
create policy "Teachers can view profiles of their attendees"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1
      from public.attendance a
      join public.events e on e.id = a.event_id
      where a.student_id = profiles.id
        and e.created_by = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 4. events policies
-- ------------------------------------------------------------

-- Any signed-in user can read event details (needed to validate QR codes)
drop policy if exists "Events are readable by any authenticated user" on public.events;
create policy "Events are readable by any authenticated user"
  on public.events for select
  to authenticated
  using (true);

-- Only the signed-in user can insert events as themselves
drop policy if exists "Users can insert events" on public.events;
create policy "Users can insert events"
  on public.events for insert
  to authenticated
  with check (created_by = auth.uid());

-- Only the creator can update their events
drop policy if exists "Users can update their own events" on public.events;
create policy "Users can update their own events"
  on public.events for update
  to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

-- ------------------------------------------------------------
-- 5. attendance policies
-- ------------------------------------------------------------

-- Students can only view / insert their own attendance
drop policy if exists "Students can view their own attendance" on public.attendance;
create policy "Students can view their own attendance"
  on public.attendance for select
  to authenticated
  using (auth.uid() = student_id);

drop policy if exists "Students can insert their own attendance" on public.attendance;
create policy "Students can insert their own attendance"
  on public.attendance for insert
  to authenticated
  with check (auth.uid() = student_id);

-- Teachers can view attendance for events they created
drop policy if exists "Teachers can view attendance for their events" on public.attendance;
create policy "Teachers can view attendance for their events"
  on public.attendance for select
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = attendance.event_id
        and e.created_by = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 6. TRIGGER — create a profile row automatically on signup
-- Reads full_name / role from the metadata the app sends on Sign Up
-- (auth.signUp options.data), so the chosen role is written atomically
-- even when email confirmation is on and there is no session yet.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data->>'full_name', ''),
    case when new.raw_user_meta_data->>'role' = 'teacher'
         then 'teacher'
         else 'student'
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- 7. INDEXES
-- ------------------------------------------------------------
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_events_created_by on public.events(created_by);
create index if not exists idx_events_event_code on public.events(event_code);
create index if not exists idx_attendance_student_id on public.attendance(student_id);
create index if not exists idx_attendance_event_id on public.attendance(event_id);
