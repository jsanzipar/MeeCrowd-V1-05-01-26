import React from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, radius } from '@/theme';

interface Props {
  embedUrl: string;
  /** Aspect ratio width/height. Defaults to 16:9. */
  aspectRatio?: number;
  /**
   * Auto-start playback. Browsers require muted autoplay, so when true we
   * append both autoplay AND mute params.
   */
  autoplay?: boolean;
}

/**
 * Append autoplay + muted params using each platform's expected names.
 * - YouTube  : ?autoplay=1&mute=1
 * - Twitch   : ?autoplay=true&muted=true (already defaults to autoplay=true)
 * - Kick     : ?autoplay=true&muted=true (best-effort)
 */
function withAutoplay(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname;
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      u.searchParams.set('autoplay', '1');
      u.searchParams.set('mute', '1');
      u.searchParams.set('playsinline', '1');
    } else if (host.includes('twitch.tv')) {
      u.searchParams.set('autoplay', 'true');
      u.searchParams.set('muted', 'true');
    } else if (host.includes('kick.com')) {
      u.searchParams.set('autoplay', 'true');
      u.searchParams.set('muted', 'true');
    } else {
      u.searchParams.set('autoplay', '1');
    }
    return u.toString();
  } catch {
    // If URL parsing fails (relative URL, etc.), fall back to a query suffix.
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}autoplay=1&mute=1`;
  }
}

/**
 * Cross-platform player. On web we drop a regular iframe (WebView's web
 * stub uses iframe internally but adds quirks). On native we use WebView,
 * which renders the platform's own player (YouTube, Twitch, Kick).
 */
export function EmbedPlayer({ embedUrl, aspectRatio = 16 / 9, autoplay = false }: Props) {
  const url = autoplay ? withAutoplay(embedUrl) : embedUrl;

  // Web: native iframe is simplest and works perfectly for all three providers.
  if (Platform.OS === 'web') {
    return (
      <View style={[styles.wrap, { aspectRatio }]}>
        {/* eslint-disable-next-line react/no-unknown-property */}
        <iframe
          src={url}
          style={{
            border: 0,
            width: '100%',
            height: '100%',
            borderRadius: radius.md,
            backgroundColor: colors.surface,
          }}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { aspectRatio }]}>
      <WebView
        source={{ uri: url }}
        style={styles.webview}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: colors.surface,
  },
});
