-- =====================================================================
-- GSY Investor Monitor: change history with old and new values
-- Run once in the Supabase SQL Editor after 001_gsy_schema.sql. Safe to run again.
-- =====================================================================

alter table public.audit_log add column if not exists details jsonb;
create index if not exists audit_log_at_idx on public.audit_log (at desc);

-- Every insert, change and delete is logged with who did it. For a change, details holds only the
-- fields that changed as {"field": [old, new]}; for an insert the new record; for a delete the old one.
create or replace function public.log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text;
  o jsonb;
  n jsonb;
  diff jsonb := '{}'::jsonb;
  k text;
begin
  select coalesce(nullif(full_name, ''), email) into who from profiles where id = auth.uid();
  if tg_op <> 'INSERT' then o := to_jsonb(old) - 'created_at' - 'updated_at' - 'updated_by' - 'last_sign_in'; end if;
  if tg_op <> 'DELETE' then n := to_jsonb(new) - 'created_at' - 'updated_at' - 'updated_by' - 'last_sign_in'; end if;
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if (o -> k) is distinct from (n -> k) then
        diff := diff || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
      end if;
    end loop;
    if diff = '{}'::jsonb then return new; end if; -- nothing that matters changed (e.g. only a sign-in time)
  end if;
  insert into audit_log (user_id, user_name, action, table_name, record_id, details)
  values (auth.uid(), coalesce(who, 'Excel import / system'), lower(tg_op), tg_table_name,
          coalesce(n ->> 'id', o ->> 'id', n ->> 'key', o ->> 'key', n ->> 'email', o ->> 'email', ''),
          case tg_op when 'UPDATE' then diff when 'INSERT' then n else o end);
  return coalesce(new, old);
end $$;

-- Data tables (already logged) plus people, roles, invites and Company Info.
do $$
declare t text;
begin
  foreach t in array array['companies','products','sales_people','commission_by_product','fx_rates','sales_targets','investors','contracts',
                           'payouts_paid','commissions_paid','expenses','transfers','leads','bank_balances','gifts',
                           'profiles','roles','invites','settings'] loop
    execute format('drop trigger if exists audit on public.%I', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.log_change()', t);
  end loop;
end $$;

-- People who enter data can read the history of the records; the Chairman (manageUsers) sees everything.
drop policy if exists read on public.audit_log;
create policy read on public.audit_log for select to authenticated
  using (public.has_perm('manageUsers') or (public.has_perm('uploadData') and coalesce(table_name, '') not in ('profiles', 'roles', 'invites')));

select 'History is on' as result;
