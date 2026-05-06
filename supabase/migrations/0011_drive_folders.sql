-- Add drive_file_id to invoices and receipts so we can delete files from Drive
alter table invoices add column if not exists drive_file_id text;
alter table receipts add column if not exists drive_file_id text;

-- Cache the per-profile Drive folder ID to avoid repeated folder lookups
alter table business_profiles add column if not exists drive_root_folder_id text;
