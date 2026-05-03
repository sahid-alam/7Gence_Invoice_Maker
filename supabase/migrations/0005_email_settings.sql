create table if not exists app_settings (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users on delete cascade,
  gmail_user        text,
  gmail_app_password text,
  updated_at        timestamptz default now(),
  unique(owner_id)
);

alter table app_settings enable row level security;

create policy "owner only"
  on app_settings
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
