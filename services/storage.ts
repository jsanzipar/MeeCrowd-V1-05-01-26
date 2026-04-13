import { supabase } from '@/lib/supabase';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export const storageService = {
  async uploadAvatar(userId: string, uri: string): Promise<string> {
    const response = await fetch(uri);
    const blob = await response.blob();

    // Derive extension from the blob's MIME type (blob URIs on web have no extension)
    const mime = blob.type || 'image/jpeg';
    const ext = MIME_TO_EXT[mime] ?? 'jpg';
    const path = `${userId}/avatar.${ext}`;

    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, blob, {
        contentType: mime,
        upsert: true,
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(path);

    // Append cache-buster so the image refreshes
    return `${publicUrl}?t=${Date.now()}`;
  },
};
