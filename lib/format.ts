/**
 * Compact number formatting used across feeds, channel cards, etc.
 * 1234 → "1.2K", 1_500_000 → "1.5M", 480_000_000 → "480M".
 */
export function formatCount(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

/** "5h 3m" / "12m" / "0:42" style for video durations in seconds. */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Strip emoji-like pictographs from a string. Used on YouTube/Twitch live
 * titles which are often peppered with 🔴, 🚨, ✅, etc., that don't
 * render at the same baseline as the surrounding text and add visual noise
 * in the compact card layout.
 *
 * Uses Unicode property `\p{Extended_Pictographic}` (covers every emoji-like
 * codepoint) plus the variation selector and zero-width joiner that often
 * accompany them. Collapses any whitespace runs left behind.
 */
export function stripEmojis(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/[\p{Extended_Pictographic}\u{200D}\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
