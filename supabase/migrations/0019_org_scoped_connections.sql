-- Gmail and Google Drive connections move from per-user to per-organization.
--
-- Both tables were keyed on owner_id back when owner_id meant "the one shared
-- account". Now that org_id is the tenancy key, an upsert with onConflict:"owner_id"
-- would collide across members instead of resolving per team.
--
-- Per-org is the right default today: the team shares one Gmail sender and one Drive,
-- and business_profiles.drive_root_folder_id already assumes a single Drive. If Gmail
-- later needs to be per-person (each member sending from their own address), that is a
-- unique(org_id, user_id) change plus a sender picker — not a redesign.
--
-- No data is deleted. Both tables hold one row each, already carrying org_id.

ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_owner_id_key;
ALTER TABLE app_settings ADD CONSTRAINT app_settings_org_id_key UNIQUE (org_id);

ALTER TABLE oauth_tokens DROP CONSTRAINT IF EXISTS oauth_tokens_owner_id_provider_key;
ALTER TABLE oauth_tokens ADD CONSTRAINT oauth_tokens_org_id_provider_key UNIQUE (org_id, provider);
