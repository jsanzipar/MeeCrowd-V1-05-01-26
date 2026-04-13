export const colors = {
  // Brand
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  primaryDark: '#5B21B6',

  // Backgrounds
  background: '#0A0A12',
  surface: '#13131D',
  card: '#1A1A2E',
  cardHover: '#222238',

  // Borders
  border: '#2A2A3E',
  borderLight: '#3A3A4E',

  // Text
  text: '#FFFFFF',
  textSecondary: '#A0A0B8',
  textMuted: '#6B6B80',
  textInverse: '#0A0A12',

  // Status
  success: '#22C55E',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#06B6D4',

  // Platform colors
  youtube: '#FF0000',
  twitch: '#9146FF',
  kick: '#53FC18',
  instagram: '#E1306C',

  // Misc
  overlay: 'rgba(0, 0, 0, 0.6)',
  transparent: 'transparent',
  white: '#FFFFFF',
  black: '#000000',
} as const;

export type ColorKey = keyof typeof colors;
