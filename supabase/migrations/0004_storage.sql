-- ============================================================
-- Storage bucket for profile logos
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-logos',
  'profile-logos',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "upload_own_logo" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'profile-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "update_own_logo" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'profile-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "delete_own_logo" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'profile-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "public_read_logos" ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-logos');
