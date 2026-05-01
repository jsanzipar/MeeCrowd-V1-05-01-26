import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

const VIDEO_EXTS = new Set(['mp4', 'mov', 'webm', 'm4v']);

export type MediaKind = 'image' | 'video';

export interface UploadedMedia {
  url: string;
  kind: MediaKind;
  mime: string;
}

async function readAsArrayBuffer(uri: string, mimeHint?: string): Promise<{ data: ArrayBuffer | Blob; mime: string }> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    const blob = await response.blob();
    return { data: blob, mime: blob.type || mimeHint || 'application/octet-stream' };
  }
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  return { data: decode(base64), mime: mimeHint || 'application/octet-stream' };
}

function inferMimeFromUri(uri: string): string {
  const ext = uri.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'mp4': return 'video/mp4';
    case 'mov': return 'video/quicktime';
    case 'webm': return 'video/webm';
    default: return 'image/jpeg';
  }
}

export const storageService = {
  async uploadAvatar(userId: string, uri: string): Promise<string> {
    let fileData: ArrayBuffer | Blob;
    let mime = 'image/jpeg';

    if (Platform.OS !== 'web') {
      // Native (iOS/Android): read file as base64, decode to ArrayBuffer
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });
      fileData = decode(base64);

      // Infer MIME from URI extension
      const uriExt = uri.split('.').pop()?.toLowerCase();
      if (uriExt === 'png') mime = 'image/png';
      else if (uriExt === 'webp') mime = 'image/webp';
      else if (uriExt === 'gif') mime = 'image/gif';
    } else {
      // Web: fetch blob URI
      const response = await fetch(uri);
      const blob = await response.blob();
      mime = blob.type || 'image/jpeg';
      fileData = blob;
    }

    const ext = MIME_TO_EXT[mime] ?? 'jpg';
    const path = `${userId}/avatar.${ext}`;

    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, fileData, {
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

  /**
   * Upload a single piece of post media (image or video) to the post-media bucket.
   * Returns the public URL + media kind.
   */
  async uploadPostMedia(userId: string, uri: string, mimeHint?: string): Promise<UploadedMedia> {
    const inferredMime = mimeHint ?? inferMimeFromUri(uri);
    const { data, mime } = await readAsArrayBuffer(uri, inferredMime);
    const finalMime = mime || inferredMime;
    const ext = MIME_TO_EXT[finalMime] ?? (finalMime.startsWith('video/') ? 'mp4' : 'jpg');
    const kind: MediaKind = VIDEO_EXTS.has(ext) || finalMime.startsWith('video/') ? 'video' : 'image';
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const path = `${userId}/${filename}`;

    const { error } = await supabase.storage
      .from('post-media')
      .upload(path, data, { contentType: finalMime, upsert: false });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('post-media')
      .getPublicUrl(path);

    return { url: publicUrl, kind, mime: finalMime };
  },
};
