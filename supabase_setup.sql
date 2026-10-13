-- ==============================================================================
-- Apna Khata Advance - Database Schema
-- Multi-Dimensional Khata, Committee/Kameti Tracker & Household Finance
-- ==============================================================================

create extension if not exists pgcrypto;

-- 1. Users Table (Phone Number + Password Hashing)
create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. User Sessions Table
create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  token text unique not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days')
);

-- 3. Khata Entries (Personal / Business Lena-Dena)
-- Type: receivable (Maine diye - lene hain), payable (Is ne diye - dene hain)
-- settlement_received (Is ne wapas diye), settlement_paid (Maine wapas diye)
create table if not exists public.khata_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  person_name text not null,
  person_phone text,
  entry_type text not null check (entry_type in ('receivable', 'payable', 'settlement_received', 'settlement_paid')),
  amount numeric(12, 2) not null check (amount > 0),
  entry_date timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);

-- 4. Committee / Kameti Groups
create table if not exists public.committees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  name text not null,
  total_amount numeric(12, 2) not null check (total_amount > 0),
  monthly_amount numeric(12, 2) not null check (monthly_amount > 0),
  total_months integer not null check (total_months > 0),
  start_date date not null,
  my_turn_month integer, -- kis month me meri kameti nikli ya nikalni hai
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 5. Committee Payments / Payouts
create table if not exists public.committee_records (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  record_type text not null check (record_type in ('payment_made', 'payout_received')),
  month_number integer not null check (month_number > 0),
  amount numeric(12, 2) not null check (amount > 0),
  record_date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

-- 6. Household Finance (Aamdan & Kharch)
create table if not exists public.household_finance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  finance_type text not null check (finance_type in ('income', 'expense')),
  category text not null, -- Maslan: Salary, Rashan, Bijli Bill, School Fee, Dawaai, etc.
  amount numeric(12, 2) not null check (amount > 0),
  entry_date timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);

-- Indexes for performance
create index if not exists idx_khata_user on public.khata_entries(user_id, entry_date desc);
create index if not exists idx_committees_user on public.committees(user_id);
create index if not exists idx_committee_records on public.committee_records(committee_id, user_id);
create index if not exists idx_household_user on public.household_finance(user_id, entry_date desc);

-- ==============================================================================
-- Security & Auth RPC Functions
-- ==============================================================================

-- Helper: Get current user id from session header 'X-App-Session'
create or replace function public.current_app_user_id()
returns uuid
language plpgsql
stable
security definer
as $$
declare
  header_token text;
  v_user_id uuid;
begin
  header_token := current_setting('request.headers', true)::json->>'x-app-session';
  if header_token is null or header_token = '' then
    return null;
  end if;

  select user_id into v_user_id
  from public.app_sessions
  where token = header_token and expires_at > now();

  return v_user_id;
end;
$$;

-- RPC: Register User (Phone, Name, Password)
create or replace function public.app_register(input_phone text, input_name text, input_password text)
returns jsonb
language plpgsql
security definer
as $$
declare
  clean_phone text;
  v_user_id uuid;
  v_token text;
begin
  clean_phone := regexp_replace(input_phone, '[^0-9+]', '', 'g');
  if length(clean_phone) < 10 then
    return jsonb_build_object('success', false, 'error', 'Sahi mobile number likhein (kam az kam 10 digits)');
  end if;
  if length(input_name) < 2 then
    return jsonb_build_object('success', false, 'error', 'Naam kam az kam 2 huroof ka hona chahiye');
  end if;
  if length(input_password) < 4 then
    return jsonb_build_object('success', false, 'error', 'Password kam az kam 4 digits/characters ka ho');
  end if;

  if exists (select 1 from public.app_users where phone = clean_phone) then
    return jsonb_build_object('success', false, 'error', 'Yeh mobile number pehle se registered hai. Login karein.');
  end if;

  insert into public.app_users (phone, name, password_hash)
  values (clean_phone, trim(input_name), crypt(input_password, gen_salt('bf', 8)))
  returning id into v_user_id;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.app_sessions (user_id, token) values (v_user_id, v_token);

  return jsonb_build_object(
    'success', true,
    'session_token', v_token,
    'user', jsonb_build_object('id', v_user_id, 'phone', clean_phone, 'name', trim(input_name))
  );
end;
$$;

-- RPC: Login User
create or replace function public.app_login(input_phone text, input_password text)
returns jsonb
language plpgsql
security definer
as $$
declare
  clean_phone text;
  v_user record;
  v_token text;
begin
  clean_phone := regexp_replace(input_phone, '[^0-9+]', '', 'g');

  select id, phone, name, password_hash into v_user
  from public.app_users
  where phone = clean_phone;

  if v_user.id is null or v_user.password_hash != crypt(input_password, v_user.password_hash) then
    return jsonb_build_object('success', false, 'error', 'Mobile number ya password ghalat hai');
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.app_sessions (user_id, token) values (v_user.id, v_token);

  return jsonb_build_object(
    'success', true,
    'session_token', v_token,
    'user', jsonb_build_object('id', v_user.id, 'phone', v_user.phone, 'name', v_user.name)
  );
end;
$$;

-- RPC: Restore Session
create or replace function public.app_restore_session()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_user record;
begin
  v_user_id := public.current_app_user_id();
  if v_user_id is null then
    return jsonb_build_object('authenticated', false);
  end if;

  select id, phone, name into v_user from public.app_users where id = v_user_id;
  if v_user.id is null then
    return jsonb_build_object('authenticated', false);
  end if;

  return jsonb_build_object(
    'authenticated', true,
    'user', jsonb_build_object('id', v_user.id, 'phone', v_user.phone, 'name', v_user.name)
  );
end;
$$;

-- RPC: Logout
create or replace function public.app_logout()
returns jsonb
language plpgsql
security definer
as $$
declare
  header_token text;
begin
  header_token := current_setting('request.headers', true)::json->>'x-app-session';
  if header_token is not null then
    delete from public.app_sessions where token = header_token;
  end if;
  return jsonb_build_object('success', true);
end;
$$;

-- ==============================================================================
-- Row Level Security (RLS) Policies
-- Users can strictly view and edit ONLY their own data
-- ==============================================================================

alter table public.app_users enable row level security;
alter table public.app_sessions enable row level security;
alter table public.khata_entries enable row level security;
alter table public.committees enable row level security;
alter table public.committee_records enable row level security;
alter table public.household_finance enable row level security;

-- khata_entries policies
create policy khata_select on public.khata_entries for select using (user_id = public.current_app_user_id());
create policy khata_insert on public.khata_entries for insert with check (user_id = public.current_app_user_id());
create policy khata_update on public.khata_entries for update using (user_id = public.current_app_user_id());
create policy khata_delete on public.khata_entries for delete using (user_id = public.current_app_user_id());

-- committees policies
create policy committees_select on public.committees for select using (user_id = public.current_app_user_id());
create policy committees_insert on public.committees for insert with check (user_id = public.current_app_user_id());
create policy committees_update on public.committees for update using (user_id = public.current_app_user_id());
create policy committees_delete on public.committees for delete using (user_id = public.current_app_user_id());

-- committee_records policies
create policy cr_select on public.committee_records for select using (user_id = public.current_app_user_id());
create policy cr_insert on public.committee_records for insert with check (user_id = public.current_app_user_id());
create policy cr_update on public.committee_records for update using (user_id = public.current_app_user_id());
create policy cr_delete on public.committee_records for delete using (user_id = public.current_app_user_id());

-- household_finance policies
create policy hf_select on public.household_finance for select using (user_id = public.current_app_user_id());
create policy hf_insert on public.household_finance for insert with check (user_id = public.current_app_user_id());
create policy hf_update on public.household_finance for update using (user_id = public.current_app_user_id());
create policy hf_delete on public.household_finance for delete using (user_id = public.current_app_user_id());

-- Grant access to anon & authenticated for RPC calls
grant usage on schema public to anon, authenticated;
grant all on public.khata_entries to anon, authenticated;
grant all on public.committees to anon, authenticated;
grant all on public.committee_records to anon, authenticated;
grant all on public.household_finance to anon, authenticated;
grant execute on function public.app_register to anon, authenticated;
grant execute on function public.app_login to anon, authenticated;
grant execute on function public.app_restore_session to anon, authenticated;
grant execute on function public.app_logout to anon, authenticated;
