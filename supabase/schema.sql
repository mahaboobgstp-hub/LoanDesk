-- LoanDesk initial schema. Run in Supabase SQL Editor.
-- IMPORTANT: review the policies and test with separate agent/admin users before real data.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'agent' check (role in ('agent','admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name',''), 'agent')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- Narrow SECURITY DEFINER helper avoids recursive profile RLS checks.
-- It returns only whether the currently authenticated user is an active admin.
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.is_active = true
  );
$$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

create table if not exists public.loan_applications (
  id uuid primary key default gen_random_uuid(),
  application_no text generated always as ('LD-' || upper(substr(replace(id::text,'-',''),1,10))) stored,
  agent_id uuid not null default auth.uid() references public.profiles(id),
  applicant_name text not null,
  mobile text not null,
  email text,
  pan text not null,
  loan_product text not null,
  requested_amount numeric(16,2) not null check (requested_amount > 0),
  income_type text not null check (income_type in ('salaried','business','professional')),
  co_applicant_available boolean not null default false,
  status text not null default 'submitted' check (status in ('submitted','under_review','documents_required','documents_submitted','approved_for_processing','rejected','completed','on_hold')),
  agent_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.applicant_income (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.loan_applications(id) on delete cascade,
  income_type text not null,
  employment_type text,
  employer_name text,
  gross_monthly_salary numeric(16,2),
  net_monthly_salary numeric(16,2),
  pf_deduction boolean not null default false,
  salary_credited_to_bank boolean not null default false,
  business_name text,
  business_constitution text,
  business_vintage_years numeric(6,2),
  business_nature text,
  average_monthly_net_income numeric(16,2),
  existing_monthly_emi numeric(16,2) not null default 0,
  other_monthly_obligations numeric(16,2) not null default 0,
  financial_years jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.co_applicants (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  full_name text not null,
  mobile text not null,
  email text,
  pan text,
  income_type text,
  income_details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.uploaded_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  file_size bigint not null,
  document_type text not null default 'other',
  uploaded_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.credit_reports (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  document_id uuid references public.uploaded_documents(id) on delete set null,
  bureau_name text not null check (bureau_name in ('CIBIL','Experian','Equifax','CRIF High Mark')),
  report_source text not null check (report_source in ('direct','third_party')),
  report_date date,
  credit_score integer,
  total_accounts integer,
  active_accounts integer,
  closed_accounts integer,
  active_credit_cards integer,
  total_outstanding numeric(16,2),
  total_overdue numeric(16,2),
  written_off boolean,
  settled boolean,
  suit_filed boolean,
  extraction_status text not null default 'pending_verification',
  extracted_summary jsonb not null default '{}'::jsonb,
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.credit_accounts (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  credit_report_id uuid references public.credit_reports(id) on delete cascade,
  institution text,
  account_reference text,
  account_type text,
  ownership text,
  date_opened date,
  date_closed date,
  last_payment_date date,
  current_balance numeric(16,2),
  overdue_amount numeric(16,2),
  written_off_amount numeric(16,2),
  account_status text,
  suit_filed boolean not null default false,
  settled boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.credit_dpd_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  credit_account_id uuid references public.credit_accounts(id) on delete cascade,
  account_reference text,
  month date not null,
  dpd_days integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.eligibility_policies (
  id uuid primary key default gen_random_uuid(),
  policy_name text not null,
  loan_product text not null,
  income_type text not null,
  eligible_income_percent numeric(5,2) not null default 60 check (eligible_income_percent between 0 and 100),
  minimum_credit_score integer,
  minimum_monthly_income numeric(16,2),
  maximum_foir numeric(5,2),
  default_interest_rate numeric(6,3),
  maximum_tenure_months integer,
  is_active boolean not null default true,
  version integer not null default 1,
  policy_json jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.eligibility_assessments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  eligible_income_percent numeric(5,2) not null,
  income_amount numeric(16,2) not null,
  eligible_income numeric(16,2) not null,
  existing_monthly_emi numeric(16,2) not null,
  available_emi numeric(16,2) not null,
  interest_rate numeric(6,3) not null,
  tenure_months integer not null,
  maximum_eligible_loan numeric(16,2) not null,
  requested_loan_emi numeric(16,2) not null,
  requested_amount_feasible boolean not null,
  assessment_json jsonb not null default '{}'::jsonb,
  assessed_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.admin_decisions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  decision text not null,
  internal_notes text,
  decided_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.document_requirements (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  document_name text not null,
  status text not null default 'requested' check (status in ('requested','uploaded','verified','rejected')),
  requested_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.loan_applications(id) on delete set null,
  actor_id uuid default auth.uid() references public.profiles(id),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_loan_applications_agent on public.loan_applications(agent_id, created_at desc);
create index if not exists idx_loan_applications_status on public.loan_applications(status, created_at desc);
create index if not exists idx_credit_accounts_application on public.credit_accounts(application_id);
create index if not exists idx_credit_dpd_application_month on public.credit_dpd_history(application_id, month desc);
create index if not exists idx_assessments_application on public.eligibility_assessments(application_id, created_at desc);

-- RLS on all exposed business tables.
alter table public.profiles enable row level security;
alter table public.loan_applications enable row level security;
alter table public.applicant_income enable row level security;
alter table public.co_applicants enable row level security;
alter table public.uploaded_documents enable row level security;
alter table public.credit_reports enable row level security;
alter table public.credit_accounts enable row level security;
alter table public.credit_dpd_history enable row level security;
alter table public.eligibility_policies enable row level security;
alter table public.eligibility_assessments enable row level security;
alter table public.admin_decisions enable row level security;
alter table public.document_requirements enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles: user sees own profile; admin sees all. Role is not user-editable.
drop policy if exists "profile read own or admin" on public.profiles;
create policy "profile read own or admin" on public.profiles for select to authenticated
using (id = (select auth.uid()) or private.is_admin());

drop policy if exists "admin update profiles" on public.profiles;
create policy "admin update profiles" on public.profiles for update to authenticated
using (private.is_admin()) with check (private.is_admin());

-- Applications: agents see/create only their own; admin sees all.
drop policy if exists "applications select own or admin" on public.loan_applications;
create policy "applications select own or admin" on public.loan_applications for select to authenticated
using (agent_id = (select auth.uid()) or private.is_admin());

drop policy if exists "applications insert own" on public.loan_applications;
create policy "applications insert own" on public.loan_applications for insert to authenticated
with check (agent_id = (select auth.uid()) and status = 'submitted');

drop policy if exists "applications update own or admin" on public.loan_applications;
create policy "applications update own or admin" on public.loan_applications for update to authenticated
using (agent_id = (select auth.uid()) or private.is_admin())
with check ((agent_id = (select auth.uid()) and status in ('submitted','documents_submitted')) or private.is_admin());

-- Child data is visible to the owner agent and admins. Agent inserts only under own lead.
do $$
declare t text;
begin
  foreach t in array array['applicant_income','co_applicants','uploaded_documents','credit_reports','credit_accounts','credit_dpd_history','document_requirements'] loop
    execute format('drop policy if exists %I on public.%I', t || ' select parent access', t);
    execute format('create policy %I on public.%I for select to authenticated using (exists (select 1 from public.loan_applications a where a.id = application_id and (a.agent_id = (select auth.uid()) or private.is_admin())))', t || ' select parent access', t);
    execute format('drop policy if exists %I on public.%I', t || ' insert parent access', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (exists (select 1 from public.loan_applications a where a.id = application_id and a.agent_id = (select auth.uid())))', t || ' insert parent access', t);
    execute format('drop policy if exists %I on public.%I', t || ' admin update', t);
    execute format('create policy %I on public.%I for update to authenticated using (private.is_admin()) with check (private.is_admin())', t || ' admin update', t);
  end loop;
end $$;


-- Credit bureau details and parsed tradeline/DPD data are admin-only.
drop policy if exists "credit_reports select parent access" on public.credit_reports;
create policy "credit_reports admin read" on public.credit_reports for select to authenticated
using (private.is_admin());

drop policy if exists "credit_accounts select parent access" on public.credit_accounts;
create policy "credit_accounts admin read" on public.credit_accounts for select to authenticated
using (private.is_admin());

drop policy if exists "credit_dpd_history select parent access" on public.credit_dpd_history;
create policy "credit_dpd_history admin read" on public.credit_dpd_history for select to authenticated
using (private.is_admin());

-- Document requirement lists are visible to the owner agent, but only admins can create/change them.
drop policy if exists "document_requirements insert parent access" on public.document_requirements;
drop policy if exists "document_requirements admin insert" on public.document_requirements;
create policy "document_requirements admin insert" on public.document_requirements for insert to authenticated
with check (private.is_admin());

-- Eligibility assessments and admin decisions are admin-only.
drop policy if exists "admin only assessments" on public.eligibility_assessments;
create policy "admin only assessments" on public.eligibility_assessments for all to authenticated
using (private.is_admin()) with check (private.is_admin());

drop policy if exists "admin only decisions" on public.admin_decisions;
create policy "admin only decisions" on public.admin_decisions for all to authenticated
using (private.is_admin()) with check (private.is_admin());

drop policy if exists "admin manage policies" on public.eligibility_policies;
create policy "admin manage policies" on public.eligibility_policies for all to authenticated
using (private.is_admin()) with check (private.is_admin());

drop policy if exists "admin only audit" on public.audit_logs;
create policy "admin only audit" on public.audit_logs for all to authenticated
using (private.is_admin()) with check (private.is_admin());

-- Storage bucket is private. Documents are stored as {application_uuid}/{random-file-name}.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('loan-private-documents','loan-private-documents',false,15728640,array['application/pdf'])
on conflict (id) do update set public=false, file_size_limit=15728640, allowed_mime_types=array['application/pdf'];

drop policy if exists "agents upload own application documents" on storage.objects;
create policy "agents upload own application documents" on storage.objects for insert to authenticated
with check (
  bucket_id = 'loan-private-documents'
  and exists (
    select 1 from public.loan_applications a
    where a.id::text = (storage.foldername(name))[1]
      and a.agent_id = (select auth.uid())
  )
);

drop policy if exists "owner agent or admin read documents" on storage.objects;
create policy "owner agent or admin read documents" on storage.objects for select to authenticated
using (
  bucket_id = 'loan-private-documents'
  and exists (
    select 1 from public.loan_applications a
    where a.id::text = (storage.foldername(name))[1]
      and (a.agent_id = (select auth.uid()) or private.is_admin())
  )
);

drop policy if exists "admin delete documents" on storage.objects;
create policy "admin delete documents" on storage.objects for delete to authenticated
using (bucket_id = 'loan-private-documents' and private.is_admin());

-- Promote your first administrator only after creating that user in Supabase Auth:
-- update public.profiles p set role='admin', full_name='Main Administrator'
-- from auth.users u where p.id=u.id and u.email='YOUR_ADMIN_EMAIL';
