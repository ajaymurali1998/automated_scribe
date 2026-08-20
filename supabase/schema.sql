-- RxVoice schema. Run this once in the Supabase SQL editor.
--
-- Two tables and one storage bucket. What is NOT here is deliberate:
--   * no raw_transcript column — the dictation is never written to disk
--   * no pdf_url column and no prescription-pdfs bucket — PDFs are generated in the
--     browser on demand from structured_rx + the doctor's profile, so no patient
--     document is ever stored
-- Both choices shrink the amount of patient data at rest to the minimum the product
-- actually needs. See docs/TECHNICAL_DESIGN.md.

-- ---------------------------------------------------------------------------
-- doctors — the letterhead printed on every prescription
-- ---------------------------------------------------------------------------
create table if not exists public.doctors (
  id                  uuid primary key references auth.users(id) on delete cascade,
  full_name           text,
  qualifications      text,
  registration_number text,
  clinic_name         text,
  clinic_address      text,
  -- A PATH inside the private `signatures` bucket, not a URL. URLs are minted as
  -- short-lived signed links at render time.
  signature_url       text,
  -- Sent to the model so it reads drug names and expected investigations through the
  -- right lens — "Ecosprin" means cardiac prophylaxis to a cardiologist, and a
  -- paediatric dose is weight-based rather than adult-flat. Free text rather than an
  -- enum so a specialty we haven't listed doesn't require a migration.
  specialty           text,
  created_at          timestamptz not null default now()
);

-- For an existing database created before specialty was added.
alter table public.doctors add column if not exists specialty text;

alter table public.doctors enable row level security;

drop policy if exists "own doctor row" on public.doctors;
create policy "own doctor row" on public.doctors
  for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- prescriptions
-- ---------------------------------------------------------------------------
create table if not exists public.prescriptions (
  id            uuid primary key default gen_random_uuid(),
  -- References auth.users rather than doctors so a prescription can be saved before
  -- the doctor has filled in their profile.
  doctor_id     uuid not null references auth.users(id) on delete cascade,
  patient_name  text,
  structured_rx jsonb not null,
  created_at    timestamptz not null default now()
);

create index if not exists prescriptions_doctor_created_idx
  on public.prescriptions (doctor_id, created_at desc);

alter table public.prescriptions enable row level security;

drop policy if exists "own prescriptions" on public.prescriptions;
create policy "own prescriptions" on public.prescriptions
  for all
  using (auth.uid() = doctor_id)
  with check (auth.uid() = doctor_id);

-- ---------------------------------------------------------------------------
-- signatures bucket (private)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('signatures', 'signatures', false)
on conflict (id) do nothing;

-- Objects are scoped by folder: a doctor may only touch signatures/<their-uid>/*.
-- storage.foldername() returns the path segments, so [1] is the uid prefix that
-- AccountForm writes to.
drop policy if exists "own signature read"   on storage.objects;
drop policy if exists "own signature write"  on storage.objects;
drop policy if exists "own signature update" on storage.objects;
drop policy if exists "own signature delete" on storage.objects;

create policy "own signature read" on storage.objects
  for select using (
    bucket_id = 'signatures' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own signature write" on storage.objects
  for insert with check (
    bucket_id = 'signatures' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Needed separately from insert because AccountForm uploads with upsert: true.
create policy "own signature update" on storage.objects
  for update using (
    bucket_id = 'signatures' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own signature delete" on storage.objects
  for delete using (
    bucket_id = 'signatures' and (storage.foldername(name))[1] = auth.uid()::text
  );
