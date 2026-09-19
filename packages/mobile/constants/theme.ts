import { Platform } from "react-native";

/**
 * Токены цвета приложения. Приложение — трейдинг-терминал и всегда тёмное,
 * поэтому `light` и `dark` содержат одну и ту же палитру (см. design.md).
 * Имена токенов совпадают с веб-дашбордом (`packages/web/src/web/styles.css`).
 */
const palette = {
  background: "#08090C",
  foreground: "#F2F4F8",
  card: "#10131A",
  cardForeground: "#F2F4F8",
  elevated: "#161A24",
  primary: "#00E58A",
  primaryForeground: "#04120C",
  secondary: "#161A24",
  secondaryForeground: "#F2F4F8",
  muted: "#161A24",
  mutedForeground: "#8A93A6",
  accent: "#161A24",
  accentForeground: "#F2F4F8",
  border: "#222735",
  destructive: "#FF3B5C",
  success: "#00E58A",
  warning: "#F5C451",
  /** CALL / бычий сигнал */
  call: "#00E58A",
  /** PUT / медвежий сигнал */
  put: "#FF3B5C",
  /** Уверенность, payout, акценты */
  gold: "#F5C451",
  /** Таймфреймы, нейтральные чипы */
  info: "#4D8DFF",
} as const;

export const Colors = {
  light: palette,
  dark: palette,
} as const;

export type ColorScheme = keyof typeof Colors;
export type ThemeColors = (typeof Colors)[ColorScheme];

/**
 * Platform-appropriate font families. Use for `fontFamily` in styles, or load a
 * custom font with `useFonts` from `expo-font` and reference it here.
 */
export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', 'Roboto Mono', monospace",
  },
});

/** Моноширинный шрифт для цифр терминала. */
export const mono = Fonts?.mono ?? "monospace";
