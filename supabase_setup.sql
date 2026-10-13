-- ==============================================================================
-- Apna Khata Advance - Clean Migration & Schema Setup (v4 - Preserved Audit & Soft Profile)
-- ==============================================================================

create extension if not exists pgcrypto;

-- Purane functions drop karein
drop function if exists public.app_register(text, text, text);
drop function if exists public.app_register(text, text, text, text, text, text);
drop function if exists public.app_login(text, text);
drop function if exists public.app_restore_session();
drop function if exists public.app_logout();
drop function if exists public.get_family_members();
drop function if exists public.app_delete_profile();
drop function if exists public.app_join_family(text);

-- Purane tables drop karein
drop table if exists public.month_rollovers cascade;
drop table if exists public.committee_records cascade;
drop table if exists public.committees cascade;
drop table if exists public.household_finance cascade;
drop table if exists public.khata_entries cascade;
drop table if exists public.app_sessions cascade;
drop table if exists public.app_users cascade;
drop table if exists public.families cascade;

-- 1. Family Groups Table
create table public.families (
  id uuid primary key default gen_random_uuid(),
  family_name text not null,
  invite_code text unique not null,
  created_at timestamptz not null default now()
);

-- 2. Users Table (with Soft Delete deleted_at & role)
create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  name text not null,
  password_hash text not null,
  family_id uuid references public.families(id) on delete set null,
  relation_role text default 'Member',
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique phone only on active users
create unique index idx_unique_active_phone on public.app_users(phone) where is_active = true;

-- 3. User Sessions Table
create table public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  token text unique not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days')
);

-- 4. Khata Entries (Data preserved with user_name snapshot even if user leaves)
create table public.khata_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users(id) on delete set null,
  user_name text not null,
  user_role text default 'Member',
  family_id uuid references public.families(id) on delete cascade,
  is_private boolean not null default true,
  person_name text not null,
  person_phone text,
  entry_type text not null check (entry_type in ('receivable', 'payable', 'settlement_received', 'settlement_paid')),
  amount numeric(12, 2) not null check (amount > 0),
  entry_date timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);

-- 5. Committee / Kameti Groups
create table public.committees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users(id) on delete set null,
  user_name text not null,
  family_id uuid references public.families(id) on delete cascade,
  is_private boolean not null default false,
  name text not null,
  total_amount numeric(12, 2) not null check (total_amount > 0),
  monthly_amount numeric(12, 2) not null check (monthly_amount > 0),
  total_months integer not null check (total_months > 0),
  start_date date not null,
  my_turn_month integer,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 6. Committee Payments / Payouts
create table public.committee_records (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.committees(id) on delete cascade,
  user_id uuid references public.app_users(id) on delete set null,
  user_name text not null,
  record_type text not null check (record_type in ('payment_made', 'payout_received')),
  month_number integer not null check (month_number > 0),
  amount numeric(12, 2) not null check (amount > 0),
  record_date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

-- 7. Household Finance (Aamdan & Kharch - Preserved)
create table public.household_finance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users(id) on delete set null,
  user_name text not null,
  user_role text default 'Member',
  family_id uuid references public.families(id) on delete cascade,
  is_private boolean not null default false,
  finance_type text not null check (finance_type in ('income', 'expense')),
  category text not null,
  amount numeric(12, 2) not null check (amount > 0),
  entry_date timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);

-- 8. Monthly Rollovers
create table public.month_rollovers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users(id) on delete set null,
  family_id uuid references public.families(id) on delete cascade,
  month_str text not null,
  carried_forward_savings numeric(12, 2) not null default 0,
  note text,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_khata_user_fam on public.khata_entries(user_id, family_id, is_private);
create index idx_comm_user_fam on public.committees(user_id, family_id);
create index idx_fin_user_fam on public.household_finance(user_id, family_id);
create index idx_rollovers on public.month_rollovers(user_id, month_str);

-- ==============================================================================
-- Security & Auth RPC Functions
-- ==============================================================================

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

create or replace function public.current_app_family_id()
returns uuid
language plpgsql
stable
security definer
as $$
declare
  v_user_id uuid;
  v_fam_id uuid;
begin
  v_user_id := public.current_app_user_id();
  if v_user_id is null then return null; end if;

  select family_id into v_fam_id from public.app_users where id = v_user_id and is_active = true;
  return v_fam_id;
end;
$$;

create or replace function public.app_register(
  input_phone text,
  input_name text,
  input_password text,
  input_family_name text default null,
  input_join_code text default null,
  input_role text default 'Member'
)
returns jsonb
language plpgsql
security definer
as $$
declare
  clean_phone text;
  clean_code text;
  v_user_id uuid;
  v_family_id uuid;
  v_token text;
  v_code text;
  v_fam record;
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

  if exists (select 1 from public.app_users where phone = clean_phone and is_active = true) then
    return jsonb_build_object('success', false, 'error', 'Yeh mobile number pehle se registered hai. Login karein.');
  end if;

  clean_code := upper(trim(coalesce(input_join_code, '')));

  if clean_code != '' then
    select id into v_family_id from public.families where upper(invite_code) = clean_code;
    if v_family_id is null then
      return jsonb_build_object('success', false, 'error', 'Family Join Code (' || clean_code || ') ghalat hai. Dobara check karein.');
    end if;
  else
    v_code := upper(substring(md5(random()::text), 1, 6));
    insert into public.families (family_name, invite_code)
    values (coalesce(nullif(trim(input_family_name), ''), trim(input_name) || ' Family'), v_code)
    returning id into v_family_id;
  end if;

  insert into public.app_users (phone, name, password_hash, family_id, relation_role, is_active)
  values (clean_phone, trim(input_name), crypt(input_password, gen_salt('bf', 8)), v_family_id, coalesce(nullif(trim(input_role), ''), 'Member'), true)
  returning id into v_user_id;

  select family_name, invite_code into v_fam from public.families where id = v_family_id;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.app_sessions (user_id, token) values (v_user_id, v_token);

  return jsonb_build_object(
    'success', true,
    'session_token', v_token,
    'user', jsonb_build_object(
      'id', v_user_id,
      'phone', clean_phone,
      'name', trim(input_name),
      'family_id', v_family_id,
      'role', input_role,
      'family_name', v_fam.family_name,
      'invite_code', v_fam.invite_code
    )
  );
end;
$$;

create or replace function public.app_login(input_phone text, input_password text)
returns jsonb
language plpgsql
security definer
as $$
declare
  clean_phone text;
  v_user record;
  v_fam record;
  v_token text;
begin
  clean_phone := regexp_replace(input_phone, '[^0-9+]', '', 'g');

  select id, phone, name, password_hash, family_id, relation_role into v_user
  from public.app_users
  where phone = clean_phone and is_active = true;

  if v_user.id is null or v_user.password_hash != crypt(input_password, v_user.password_hash) then
    return jsonb_build_object('success', false, 'error', 'Mobile number ya password ghalat hai');
  end if;

  select family_name, invite_code into v_fam from public.families where id = v_user.family_id;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.app_sessions (user_id, token) values (v_user.id, v_token);

  return jsonb_build_object(
    'success', true,
    'session_token', v_token,
    'user', jsonb_build_object(
      'id', v_user.id,
      'phone', v_user.phone,
      'name', v_user.name,
      'family_id', v_user.family_id,
      'role', v_user.relation_role,
      'family_name', v_fam.family_name,
      'invite_code', v_fam.invite_code
    )
  );
end;
$$;

create or replace function public.app_restore_session()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_user record;
  v_fam record;
begin
  v_user_id := public.current_app_user_id();
  if v_user_id is null then
    return jsonb_build_object('authenticated', false);
  end if;

  select id, phone, name, family_id, relation_role into v_user from public.app_users where id = v_user_id and is_active = true;
  if v_user.id is null then
    return jsonb_build_object('authenticated', false);
  end if;

  select family_name, invite_code into v_fam from public.families where id = v_user.family_id;

  return jsonb_build_object(
    'authenticated', true,
    'user', jsonb_build_object(
      'id', v_user.id,
      'phone', v_user.phone,
      'name', v_user.name,
      'family_id', v_user.family_id,
      'role', v_user.relation_role,
      'family_name', v_fam.family_name,
      'invite_code', v_fam.invite_code
    )
  );
end;
$$;

create or replace function public.get_family_members()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_fam_id uuid;
  members jsonb;
begin
  v_fam_id := public.current_app_family_id();
  if v_fam_id is null then return '[]'::jsonb; end if;

  select jsonb_agg(jsonb_build_object(
    'id', id,
    'name', name,
    'phone', phone,
    'role', relation_role,
    'is_active', is_active,
    'joined_at', created_at
  )) into members
  from public.app_users
  where family_id = v_fam_id and is_active = true
  order by created_at asc;

  return coalesce(members, '[]'::jsonb);
end;
$$;

-- RPC: Soft Delete Profile (User account deactivated, historical family data preserved)
create or replace function public.app_delete_profile()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.current_app_user_id();
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Session expire ho gaya hai');
  end if;

  -- Deactivate user so they can re-register if needed, but historical shared records remain intact
  update public.app_users
  set is_active = false, deleted_at = now()
  where id = v_user_id;

  delete from public.app_sessions where user_id = v_user_id;

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.app_join_family(input_code text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_fam record;
begin
  v_user_id := public.current_app_user_id();
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Pehle login karein');
  end if;

  select id, family_name, invite_code into v_fam
  from public.families
  where upper(invite_code) = upper(trim(input_code));

  if v_fam.id is null then
    return jsonb_build_object('success', false, 'error', 'Family Invite Code ghalat hai');
  end if;

  update public.app_users
  set family_id = v_fam.id
  where id = v_user_id;

  return jsonb_build_object(
    'success', true,
    'family_name', v_fam.family_name,
    'invite_code', v_fam.invite_code
  );
end;
$$;

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
-- Row Level Security (RLS)
-- ==============================================================================

alter table public.families enable row level security;
alter table public.app_users enable row level security;
alter table public.app_sessions enable row level security;
alter table public.khata_entries enable row level security;
alter table public.committees enable row level security;
alter table public.committee_records enable row level security;
alter table public.household_finance enable row level security;
alter table public.month_rollovers enable row level security;

create policy fam_select on public.families for select using (id = public.current_app_family_id());
create policy users_select on public.app_users for select using (family_id = public.current_app_family_id());

create policy khata_select on public.khata_entries for select using (
  (user_id = public.current_app_user_id()) or
  (is_private = false and family_id = public.current_app_family_id())
);
create policy khata_insert on public.khata_entries for insert with check (
  (user_id = public.current_app_user_id()) or (family_id = public.current_app_family_id())
);
create policy khata_update on public.khata_entries for update using (
  (user_id = public.current_app_user_id()) or (family_id = public.current_app_family_id())
);
create policy khata_delete on public.khata_entries for delete using (
  (user_id = public.current_app_user_id()) or (family_id = public.current_app_family_id())
);

create policy comm_select on public.committees for select using (
  (user_id = public.current_app_user_id()) or
  (is_private = false and family_id = public.current_app_family_id())
);
create policy comm_insert on public.committees for insert with check (family_id = public.current_app_family_id());
create policy comm_update on public.committees for update using (family_id = public.current_app_family_id());
create policy comm_delete on public.committees for delete using (family_id = public.current_app_family_id());

create policy hf_select on public.household_finance for select using (
  (user_id = public.current_app_user_id()) or
  (is_private = false and family_id = public.current_app_family_id())
);
create policy hf_insert on public.household_finance for insert with check (family_id = public.current_app_family_id());
create policy hf_update on public.household_finance for update using (family_id = public.current_app_family_id());
create policy hf_delete on public.household_finance for delete using (family_id = public.current_app_family_id());

create policy roll_select on public.month_rollovers for select using (family_id = public.current_app_family_id());
create policy roll_insert on public.month_rollovers for insert with check (family_id = public.current_app_family_id());
create policy roll_update on public.month_rollovers for update using (family_id = public.current_app_family_id());
create policy roll_delete on public.month_rollovers for delete using (family_id = public.current_app_family_id());

-- Permissions
grant usage on schema public to anon, authenticated;
grant all on public.families to anon, authenticated;
grant all on public.app_users to anon, authenticated;
grant all on public.khata_entries to anon, authenticated;
grant all on public.committees to anon, authenticated;
grant all on public.committee_records to anon, authenticated;
grant all on public.household_finance to anon, authenticated;
grant all on public.month_rollovers to anon, authenticated;

grant execute on function public.app_register(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.app_login(text, text) to anon, authenticated;
grant execute on function public.app_restore_session() to anon, authenticated;
grant execute on function public.app_logout() to anon, authenticated;
grant execute on function public.get_family_members() to anon, authenticated;
grant execute on function public.app_delete_profile() to anon, authenticated;
grant execute on function public.app_join_family(text) to anon, authenticated;
