create table if not exists oauth_tokens (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users on delete cascade,
  provider      text not null,
  access_token  text not null,
  refresh_token text,
  expires_at    timestamptz,
  scope         text,
  unique(owner_id, provider)
);

alter table oauth_tokens enable row level security;

create policy "owner only"
  on oauth_tokens
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
