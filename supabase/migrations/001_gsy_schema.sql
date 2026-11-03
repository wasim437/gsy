-- =====================================================================
-- GSY Investor Monitor: database setup (run once in Supabase SQL Editor)
-- Tables mirror the GSY data-entry Excel. Every table has Row Level
-- Security: nobody can read anything unless they have an active profile,
-- and only people with the "uploadData" permission can change records.
-- The first account that signs up becomes the Chairman (see bootstrap_chairman.local.sql to
-- make an existing account the Chairman instead).
-- =====================================================================

-- ---------------------------------------------------------------- access
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text not null,
  mobile text,
  role text not null default 'Pending',
  permissions text[] not null default '{}',
  countries text[] not null default '{}',          -- empty = all countries
  status text not null default 'Pending' check (status in ('Active', 'Disabled', 'Pending')),
  is_chairman boolean not null default false,
  created_at timestamptz not null default now(),
  last_sign_in timestamptz
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  permissions text[] not null default '{}',
  countries text[] not null default '{}',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.invites (
  email text primary key,
  full_name text not null default '',
  mobile text,
  role text not null,
  permissions text[] not null default '{}',
  countries text[] not null default '{}',
  invited_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  user_name text,
  action text not null,
  table_name text,
  record_id text
);

-- Helper checks used by every policy (security definer so they can read profiles).
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'Active')
$$;

create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'Active' and (is_chairman or p = any (permissions)))
$$;

create or replace function public.can_see_country(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'Active'
                 and (is_chairman or cardinality(countries) = 0 or c = any (countries)))
$$;

-- New sign-up: first ever = Chairman; invited email = gets the invite's role; anyone else = Pending (no access).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv invites%rowtype;
begin
  if not exists (select 1 from profiles) then
    insert into profiles (id, full_name, email, role, permissions, status, is_chairman)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', 'Chairman'), new.email, 'Chairman',
            array['viewDashboards','viewInvestors','viewCommissions','downloadStatements','useAI','exportData','uploadData','reviewData','manageUsers'],
            'Active', true);
  else
    select * into inv from invites where lower(email) = lower(new.email);
    if found then
      insert into profiles (id, full_name, email, mobile, role, permissions, countries, status)
      values (new.id, coalesce(nullif(inv.full_name, ''), new.raw_user_meta_data ->> 'full_name', ''), new.email, inv.mobile,
              inv.role, inv.permissions, inv.countries, 'Active');
      delete from invites where lower(email) = lower(new.email);
    else
      insert into profiles (id, full_name, email, status) values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email, 'Pending');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Nobody can take the Chairman flag, give it away, or switch the Chairman off.
create or replace function public.protect_chairman() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.is_chairman then raise exception 'The Chairman cannot be removed'; end if;
    return old;
  end if;
  if new.is_chairman is distinct from old.is_chairman then raise exception 'The Chairman flag cannot be changed'; end if;
  if old.is_chairman and new.status <> 'Active' then raise exception 'The Chairman cannot be disabled'; end if;
  if new.id = auth.uid() and not old.is_chairman and (new.permissions is distinct from old.permissions or new.countries is distinct from old.countries or new.status is distinct from old.status) then
    raise exception 'You cannot change your own access';
  end if;
  return new;
end $$;
drop trigger if exists protect_chairman on public.profiles;
create trigger protect_chairman before update or delete on public.profiles for each row execute function public.protect_chairman();

-- ---------------------------------------------------------------- setup lists
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  company_type text not null check (company_type in ('Investment Company', 'Sub-company')),
  country text not null check (country in ('UAE', 'India', 'Malaysia')),
  monthly_commission_pct numeric(9, 6) check (monthly_commission_pct between 0 and 0.5),
  trade_licence_expiry date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  months int not null check (months between 1 and 240),
  monthly_profit_pct numeric(9, 6) not null check (monthly_profit_pct between 0 and 0.5),
  profit_paid text not null default 'Every month' check (profit_paid in ('Every month', 'Every 3 months', 'At the end')),
  company_commission_pct numeric(9, 6) check (company_commission_pct between 0 and 0.5),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.sales_people (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  staff_type text not null default 'Staff' check (staff_type in ('Staff', 'Freelancer')),
  country text not null default 'UAE' check (country in ('UAE', 'India', 'Malaysia')),
  commission_pct numeric(9, 6) not null default 0 check (commission_pct between 0 and 0.5),
  commission_paid text not null default 'One time' check (commission_paid in ('One time', 'Every month')),
  email text, mobile text,
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.commission_by_product (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  sales_person_id uuid references public.sales_people (id) on delete cascade,
  commission_pct numeric(9, 6) not null check (commission_pct between 0 and 0.5),
  commission_paid text check (commission_paid in ('One time', 'Every month')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  currency text not null check (currency in ('USD', 'INR', 'MYR', 'SGD')),
  rate_to_aed numeric(14, 6) not null check (rate_to_aed > 0),
  unique (month, currency),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.sales_targets (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  country text not null check (country in ('UAE', 'India', 'Malaysia')),
  sales_person_id uuid references public.sales_people (id) on delete cascade,
  target_aed numeric(16, 2) not null check (target_aed >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- records
create table if not exists public.investors (
  id uuid primary key default gen_random_uuid(),
  investor_code text not null unique,
  investor_type text not null default 'Person' check (investor_type in ('Person', 'Company')),
  full_name text not null,
  country text not null check (country in ('UAE', 'India', 'Malaysia')),
  city text, nationality text, mobile text, email text,
  date_of_birth date, wedding_anniversary date,
  passport_no text, passport_expiry date, emirates_id_expiry date, visa_expiry date, trade_licence_expiry date,
  kyc_status text not null default 'Pending' check (kyc_status in ('Done', 'Pending', 'Expired')),
  sales_person_id uuid references public.sales_people (id) on delete set null,
  referred_by_investor_id uuid references public.investors (id) on delete set null,
  address text, kyc_documents_link text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  contract_no text not null unique,
  investor_id uuid not null references public.investors (id) on delete restrict,
  company_id uuid not null references public.companies (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  sales_person_id uuid references public.sales_people (id) on delete set null,
  currency text not null default 'AED' check (currency in ('AED', 'USD', 'INR', 'MYR', 'SGD')),
  amount numeric(16, 2) not null check (amount > 0),
  start_date date not null,
  special_months int check (special_months between 1 and 240),
  special_profit_pct numeric(9, 6) check (special_profit_pct between 0 and 0.5),
  special_commission_pct numeric(9, 6) check (special_commission_pct between 0 and 0.5),
  payment_method text check (payment_method in ('Bank transfer', 'Cheque', 'Cash', 'Other')),
  receipt_bank_reference text,
  status text not null default 'Active' check (status in ('Active', 'Finished', 'Closed early')),
  renewal_plan text check (renewal_plan in ('Will renew', 'Not decided', 'Taking money back')),
  closed_early_date date,
  early_closure_penalty numeric(16, 2),
  contract_pdf_link text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.payouts_paid (
  id uuid primary key default gen_random_uuid(),
  payment_date date not null,
  contract_id uuid not null references public.contracts (id) on delete restrict,
  amount numeric(16, 2) not null check (amount > 0),
  currency text not null default 'AED' check (currency in ('AED', 'USD', 'INR', 'MYR', 'SGD')),
  payment_for text not null default 'Monthly profit' check (payment_for in ('Monthly profit', 'Capital return', 'Profit and capital')),
  payment_status text not null default 'Paid and cleared' check (payment_status in ('Paid and cleared', 'Sent but not cleared', 'Returned or failed')),
  bank_reference text unique,
  paid_from_account text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.commissions_paid (
  id uuid primary key default gen_random_uuid(),
  payment_date date not null,
  sales_person_id uuid not null references public.sales_people (id) on delete restrict,
  contract_id uuid references public.contracts (id) on delete set null,
  amount numeric(16, 2) not null check (amount > 0),
  currency text not null default 'AED' check (currency in ('AED', 'USD', 'INR', 'MYR', 'SGD')),
  reference text, notes text,
  import_key text unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  company_id uuid not null references public.companies (id) on delete restrict,
  country text not null check (country in ('UAE', 'India', 'Malaysia')),
  expense_type text not null check (expense_type in ('Salary', 'Rent', 'Marketing', 'Other')),
  description text,
  amount numeric(16, 2) not null check (amount > 0),
  currency text not null default 'AED' check (currency in ('AED', 'USD', 'INR', 'MYR', 'SGD')),
  notes text,
  import_key text unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  from_company_id uuid not null references public.companies (id) on delete restrict,
  to_company_id uuid not null references public.companies (id) on delete restrict,
  direction text not null check (direction in ('Sent to sub-company', 'Returned to group')),
  amount numeric(16, 2) not null check (amount > 0),
  currency text not null default 'AED' check (currency in ('AED', 'USD', 'INR', 'MYR', 'SGD')),
  purpose text, bank_reference text,
  import_key text unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  lead_name text not null,
  mobile text,
  sales_person_id uuid references public.sales_people (id) on delete set null,
  date_added date not null,
  stage text not null default 'New lead' check (stage in ('New lead', 'Meeting done', 'Proposal sent', 'KYC in progress', 'Invested', 'Lost')),
  expected_amount numeric(16, 2),
  currency text default 'AED' check (currency in ('AED', 'USD', 'INR', 'MYR', 'SGD')),
  product_id uuid references public.products (id) on delete set null,
  lead_source text check (lead_source in ('Referral', 'Social media', 'Event', 'Freelancer', 'Website', 'Other')),
  last_contact_date date, next_step text, next_step_date date, lost_reason text, notes text,
  import_key text unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.bank_balances (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  bank_name text not null,
  account_name text not null,
  currency text not null default 'AED' check (currency in ('AED', 'USD', 'INR', 'MYR', 'SGD')),
  balance numeric(18, 2) not null,
  notes text,
  unique (date, bank_name, account_name),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  investor_id uuid not null references public.investors (id) on delete cascade,
  occasion text not null check (occasion in ('Birthday', 'Wedding anniversary', 'Contract anniversary', 'Festival', 'Other')),
  gift text, cost_aed numeric(12, 2),
  sent_by uuid references public.sales_people (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- Company Info answers (one row per question).
create table if not exists public.settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

-- ---------------------------------------------------------------- housekeeping triggers
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create or replace function public.log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  select coalesce(nullif(full_name, ''), email) into who from profiles where id = auth.uid();
  insert into audit_log (user_id, user_name, action, table_name, record_id)
  values (auth.uid(), coalesce(who, 'system'), lower(tg_op), tg_table_name, coalesce((case when tg_op = 'DELETE' then old.id else new.id end)::text, ''));
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['companies','products','sales_people','commission_by_product','fx_rates','sales_targets','investors','contracts',
                           'payouts_paid','commissions_paid','expenses','transfers','leads','bank_balances','gifts'] loop
    execute format('drop trigger if exists touch on public.%I', t);
    execute format('create trigger touch before update on public.%I for each row execute function public.touch_updated_at()', t);
    execute format('drop trigger if exists audit on public.%I', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.log_change()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- row level security
do $$
declare t text;
begin
  foreach t in array array['profiles','roles','invites','audit_log','companies','products','sales_people','commission_by_product','fx_rates',
                           'sales_targets','investors','contracts','payouts_paid','commissions_paid','expenses','transfers','leads',
                           'bank_balances','gifts','settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Read: any active member (country limits where a country applies). Write: "uploadData" permission.
do $$
declare t text;
begin
  foreach t in array array['companies','products','sales_people','commission_by_product','fx_rates','sales_targets','transfers','bank_balances','gifts'] loop
    execute format('drop policy if exists read on public.%I', t);
    execute format('create policy read on public.%I for select to authenticated using (public.is_member())', t);
    execute format('drop policy if exists write on public.%I', t);
    execute format('create policy write on public.%I for all to authenticated using (public.has_perm(''uploadData'')) with check (public.has_perm(''uploadData''))', t);
  end loop;
end $$;

drop policy if exists read on public.investors;
create policy read on public.investors for select to authenticated using (public.can_see_country(country));
drop policy if exists write on public.investors;
create policy write on public.investors for all to authenticated using (public.has_perm('uploadData')) with check (public.has_perm('uploadData'));

drop policy if exists read on public.contracts;
create policy read on public.contracts for select to authenticated
  using (exists (select 1 from public.investors i where i.id = investor_id and public.can_see_country(i.country)));
drop policy if exists write on public.contracts;
create policy write on public.contracts for all to authenticated using (public.has_perm('uploadData')) with check (public.has_perm('uploadData'));

drop policy if exists read on public.payouts_paid;
create policy read on public.payouts_paid for select to authenticated
  using (exists (select 1 from public.contracts c join public.investors i on i.id = c.investor_id where c.id = contract_id and public.can_see_country(i.country)));
drop policy if exists write on public.payouts_paid;
create policy write on public.payouts_paid for all to authenticated using (public.has_perm('uploadData')) with check (public.has_perm('uploadData'));

drop policy if exists read on public.commissions_paid;
create policy read on public.commissions_paid for select to authenticated using (public.has_perm('viewCommissions') or public.has_perm('viewDashboards'));
drop policy if exists write on public.commissions_paid;
create policy write on public.commissions_paid for all to authenticated using (public.has_perm('uploadData')) with check (public.has_perm('uploadData'));

drop policy if exists read on public.expenses;
create policy read on public.expenses for select to authenticated using (public.can_see_country(country));
drop policy if exists write on public.expenses;
create policy write on public.expenses for all to authenticated using (public.has_perm('uploadData')) with check (public.has_perm('uploadData'));

drop policy if exists read on public.leads;
create policy read on public.leads for select to authenticated
  using (public.is_member() and (sales_person_id is null or exists (select 1 from public.sales_people s where s.id = sales_person_id and public.can_see_country(s.country))));
drop policy if exists write on public.leads;
create policy write on public.leads for all to authenticated using (public.has_perm('uploadData')) with check (public.has_perm('uploadData'));

drop policy if exists read on public.settings;
create policy read on public.settings for select to authenticated using (public.is_member());
drop policy if exists write on public.settings;
create policy write on public.settings for all to authenticated using (public.has_perm('manageUsers') or public.has_perm('uploadData')) with check (public.has_perm('manageUsers') or public.has_perm('uploadData'));

-- People and roles: you can always see yourself; managing others needs "manageUsers".
drop policy if exists read on public.profiles;
create policy read on public.profiles for select to authenticated using (id = auth.uid() or public.has_perm('manageUsers'));
drop policy if exists manage on public.profiles;
create policy manage on public.profiles for update to authenticated using (public.has_perm('manageUsers')) with check (public.has_perm('manageUsers'));
drop policy if exists remove on public.profiles;
create policy remove on public.profiles for delete to authenticated using (public.has_perm('manageUsers'));
drop policy if exists self_sign_in on public.profiles;
create policy self_sign_in on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists read on public.roles;
create policy read on public.roles for select to authenticated using (public.is_member());
drop policy if exists write on public.roles;
create policy write on public.roles for all to authenticated using (public.has_perm('manageUsers')) with check (public.has_perm('manageUsers'));

drop policy if exists manage on public.invites;
create policy manage on public.invites for all to authenticated using (public.has_perm('manageUsers')) with check (public.has_perm('manageUsers'));

drop policy if exists read on public.audit_log;
create policy read on public.audit_log for select to authenticated using (public.has_perm('manageUsers'));
drop policy if exists add on public.audit_log;
create policy add on public.audit_log for insert to authenticated with check (public.is_member() and user_id = auth.uid());

-- Helpful indexes for the dashboards.
create index if not exists contracts_investor_idx on public.contracts (investor_id);
create index if not exists payouts_contract_idx on public.payouts_paid (contract_id);
create index if not exists commissions_sales_idx on public.commissions_paid (sales_person_id);
create index if not exists leads_sales_idx on public.leads (sales_person_id);
