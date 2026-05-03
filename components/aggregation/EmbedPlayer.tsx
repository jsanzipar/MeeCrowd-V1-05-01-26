import React, { useState, useCallback } from 'react';
import { Platform, View, StyleSheet, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import YoutubePlayer from 'react-native-youtube-iframe';
import { colors, radius } from '@/theme';

interface Props {
  embedUrl: string;
  /** Aspect ratio width/height. Defaults to 16:9. */
  aspectRatio?: number;
  /**
   * Auto-start playback. Browsers require muted autoplay, so when true we
   * append both autoplay AND mute params (or use the YouTube iframe API).
   */
  autoplay?: boolean;
}

/** Extract a YouTube video ID from any embed/share URL, or null. */
function getYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname;
    if (host.includes('youtu.be')) {
      // https://youtu.be/VIDEO_ID
      const id = u.pathname.replace(/^\//, '').split('/')[0];
      return id || null;
    }
    if (host.includes('youtube.com')) {
      // /embed/VIDEO_ID  OR  /watch?v=VIDEO_ID
      if (u.pathname.startsWith('/embed/')) {
        return u.pathname.replace('/embed/', '').split('/')[0] || null;
      }
      const v = u.searchParams.get('v');
      if (v) return v;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Append autoplay + muted params using each platform's expected names.
 * Browsers block UNMUTED autoplay, so muting is required for true autoplay.
 * - YouTube  : ?autoplay=1&mute=1&playsinline=1
 * - Twitch   : ?autoplay=true&muted=true
 * - Kick     : ?autoplay=true&muted=true
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
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}autoplay=1&mute=1`;
  }
}

/**
 * Cross-platform embedded media player.
 *
 * - YouTube on native → react-native-youtube-iframe (purpose-built; avoids
 *   WebView quirks like Error 153/152 caused by referrer/User-Agent
 *   mismatch on iOS).
 * - Twitch/Kick on native → react-native-webview directly (their players
 *   are WebView-friendly out of the box).
 * - Anything on web → native <iframe>.
 */
export function EmbedPlayer({ embedUrl, aspectRatio = 16 / 9, autoplay = false }: Props) {
  // Web path: a plain iframe works for every provider in the browser.
  if (Platform.OS === 'web') {
    const url = autoplay ? withAutoplay(embedUrl) : embedUrl;
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

  // YouTube on native → dedicated iframe component.
  const ytId = getYouTubeVideoId(embedUrl);
  if (ytId) {
    return (
      <View style={[styles.wrap, { aspectRatio }]}>
        <YouTubeBlock videoId={ytId} aspectRatio={aspectRatio} autoplay={autoplay} />
      </View>
    );
  }

  // Twitch / Kick / fallback → plain WebView with the URL.
  const url = autoplay ? withAutoplay(embedUrl) : embedUrl;
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
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

/**
 * YouTube subcomponent. Starts with play=false, flips to play=true after
 * the onReady callback fires — this is the canonical workaround for the
 * react-native-youtube-iframe issue where `play` set true on initial mount
 * is sometimes ignored before the player has finished initializing.
 */
function YouTubeBlock({
  videoId,
  aspectRatio,
  autoplay,
}: {
  videoId: string;
  aspectRatio: number;
  autoplay: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const width = Dimensions.get('window').width;
  const height = Math.round(width / aspectRatio);

  const onReady = useCallback(() => {
    if (autoplay) setPlaying(true);
  }, [autoplay]);

  const onChangeState = useCallback((state: string) => {
    // Keep state in sync with the player so the user pausing via the
    // YouTube controls works (and prevents autoplay loop on resume).
    if (state === 'playing') setPlaying(true);
    else if (state === 'paused' || state === 'ended') setPlaying(false);
  }, []);

  return (
    <YoutubePlayer
      height={height}
      width={width}
      videoId={videoId}
      play={playing}
      mute={autoplay} /* iOS/Android require muted for autoplay */
      onReady={onReady}
      onChangeState={onChangeState}
      webViewProps={{
        allowsInlineMediaPlayback: true,
        allowsFullscreenVideo: true,
      }}
      initialPlayerParams={{
        controls: true,
        modestbranding: true,
        rel: false,
      }}
    />
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
