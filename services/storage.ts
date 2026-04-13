import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export const storageService = {
  async uploadAvatar(userId: string, uri: string): Promise<string> {
    let fileData: ArrayBuffer | Blob;
    let mime = 'image/jpeg';

    if (Platform.OS !== 'web') {
      // Native (iOS/Android): read file as base64, decode to ArrayBuffer
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
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
};
