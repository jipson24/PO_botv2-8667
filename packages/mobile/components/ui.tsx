import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, mono } from "@/constants/theme";

const c = Colors.dark;

export type ChipTone = "muted" | "call" | "put" | "gold" | "info";

const TONES: Record<ChipTone, { fg: string; bg: string; border: string }> = {
  muted: { fg: c.mutedForeground, bg: "rgba(138,147,166,0.10)", border: "rgba(138,147,166,0.24)" },
  call: { fg: c.call, bg: "rgba(0,229,138,0.12)", border: "rgba(0,229,138,0.34)" },
  put: { fg: c.put, bg: "rgba(255,59,92,0.12)", border: "rgba(255,59,92,0.34)" },
  gold: { fg: c.gold, bg: "rgba(245,196,81,0.12)", border: "rgba(245,196,81,0.32)" },
  info: { fg: c.info, bg: "rgba(77,141,255,0.12)", border: "rgba(77,141,255,0.32)" },
};

export function Chip({
  label,
  tone = "muted",
  icon,
}: {
  label: string;
  tone?: ChipTone;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const t = TONES[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg, borderColor: t.border }]}>
      {icon ? <Ionicons name={icon} size={11} color={t.fg} /> : null}
      <Text style={[styles.chipText, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function Panel({
  children,
  style,
  title,
  right,
}: {
  children?: ReactNode;
  style?: ViewStyle;
  title?: string;
  right?: ReactNode;
}) {
  return (
    <View style={[styles.panel, style]}>
      {title ? (
        <View style={styles.panelHead}>
          <Text style={styles.panelTitle}>{title}</Text>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Stat({
  label,
  value,
  tone = "foreground",
  hint,
}: {
  label: string;
  value: string;
  tone?: "foreground" | "call" | "put" | "gold" | "info";
  hint?: string;
}) {
  const color =
    tone === "call"
      ? c.call
      : tone === "put"
        ? c.put
        : tone === "gold"
          ? c.gold
          : tone === "info"
            ? c.info
            : c.foreground;
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

export function ConfidenceBar({ value, tone }: { value: number; tone: "call" | "put" }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={styles.barTrack}>
      <View
        style={[
          styles.barFill,
          { width: `${pct}%`, backgroundColor: tone === "call" ? c.call : c.put },
        ]}
      />
    </View>
  );
}

export function Empty({ text, icon = "pulse-outline" }: { text: string; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={26} color={c.mutedForeground} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function Loading({ text = "загрузка…" }: { text?: string }) {
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={c.primary} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSub}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, tone ? { color: tone } : null]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipText: { fontSize: 10, fontFamily: mono, letterSpacing: 0.3 },
  panel: {
    backgroundColor: c.card,
    borderColor: c.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
  },
  panelHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  panelTitle: {
    color: c.mutedForeground,
    fontSize: 11,
    fontFamily: mono,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  stat: {
    flex: 1,
    backgroundColor: c.card,
    borderColor: c.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 2,
  },
  statLabel: { color: c.mutedForeground, fontSize: 9, letterSpacing: 0.8, fontFamily: mono },
  statValue: { fontSize: 19, fontFamily: mono, fontWeight: "700" },
  statHint: { color: c.mutedForeground, fontSize: 9, fontFamily: mono },
  barTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(138,147,166,0.16)",
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 999 },
  empty: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 34 },
  emptyText: { color: c.mutedForeground, fontSize: 12, fontFamily: mono, textAlign: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerTitle: { color: c.foreground, fontSize: 21, fontWeight: "700", letterSpacing: -0.3 },
  headerSub: { color: c.mutedForeground, fontSize: 11, fontFamily: mono, marginTop: 2 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 5 },
  rowLabel: { color: c.mutedForeground, fontSize: 12, flexShrink: 0 },
  rowValue: {
    color: c.foreground,
    fontSize: 12,
    fontFamily: mono,
    flex: 1,
    textAlign: "right",
  },
});
