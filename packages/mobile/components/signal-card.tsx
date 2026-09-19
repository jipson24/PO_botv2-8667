import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, mono } from "@/constants/theme";
import { countdown, expiryLabel, price, timeHM, toArray } from "@/lib/format";
import { useTick } from "@/hooks/use-tick";
import type { Signal } from "@/types/api";
import { Chip, ConfidenceBar } from "./ui";

const c = Colors.dark;

export function SignalCard({
  signal,
  onPress,
  compact = false,
}: {
  signal: Signal;
  onPress?: () => void;
  compact?: boolean;
}) {
  const now = useTick(1000);
  const isCall = signal.direction === "call";
  const tone = isCall ? c.call : c.put;
  const left = countdown(signal.expiresAt, now);
  const live = left !== "истёк";
  const reasons = toArray(signal.reasons);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.card,
        { borderColor: pressed ? tone : c.border, opacity: pressed ? 0.92 : 1 },
      ]}
    >
      <View style={[s.glow, { backgroundColor: tone }]} />

      <View style={s.head}>
        <View style={[s.dirBadge, { backgroundColor: isCall ? "rgba(0,229,138,0.12)" : "rgba(255,59,92,0.12)", borderColor: tone }]}>
          <Ionicons name={isCall ? "trending-up" : "trending-down"} size={16} color={tone} />
          <Text style={[s.dirText, { color: tone }]}>{isCall ? "CALL" : "PUT"}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.symbol} numberOfLines={1}>
            {signal.assetName}
          </Text>
          <Text style={s.sub}>
            {timeHM(signal.entryAt)} · {expiryLabel(signal.expirySeconds)} · {price(signal.price)}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[s.conf, { color: tone }]}>{signal.confidence}%</Text>
          <Text style={s.confLabel}>уверенность</Text>
        </View>
      </View>

      <View style={{ marginTop: 10 }}>
        <ConfidenceBar value={signal.confidence} tone={isCall ? "call" : "put"} />
      </View>

      <View style={s.chips}>
        <Chip label={`payout ${signal.payout}%`} tone="gold" icon="cash-outline" />
        <Chip
          label={live ? `экспирация ${left}` : "истёк"}
          tone={live ? "info" : "muted"}
          icon="time-outline"
        />
        {signal.sentToTelegram ? (
          <Chip label="в Telegram" tone="call" icon="paper-plane-outline" />
        ) : (
          <Chip label="не отправлен" tone="muted" icon="paper-plane-outline" />
        )}
      </View>

      {compact ? null : (
        <View style={s.tfBlock}>
          <TfRow tf="30m" label="bias" value={signal.biasH30} />
          <TfRow tf="15m" label="подтверждение" value={signal.biasM15} />
          <TfRow tf="5m" label="триггер" value={signal.triggerM5} />
        </View>
      )}

      {compact || reasons.length === 0 ? null : (
        <View style={s.reasons}>
          {reasons.slice(0, 4).map((r) => (
            <View key={r} style={s.reasonRow}>
              <Ionicons name="checkmark-circle" size={12} color={tone} />
              <Text style={s.reasonText} numberOfLines={2}>
                {r}
              </Text>
            </View>
          ))}
          {reasons.length > 4 ? (
            <Text style={s.more}>+{reasons.length - 4} ещё — открыть разбор</Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

function TfRow({ tf, label, value }: { tf: string; label: string; value: string }) {
  return (
    <View style={s.tfRow}>
      <View style={s.tfTag}>
        <Text style={s.tfTagText}>{tf}</Text>
      </View>
      <Text style={s.tfLabel}>{label}</Text>
      <Text style={s.tfValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: c.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 14,
    overflow: "hidden",
  },
  glow: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3, opacity: 0.85 },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  dirBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  dirText: { fontSize: 11, fontFamily: mono, fontWeight: "700", letterSpacing: 0.5 },
  symbol: { color: c.foreground, fontSize: 16, fontWeight: "700", fontFamily: mono },
  sub: { color: c.mutedForeground, fontSize: 10, fontFamily: mono, marginTop: 2 },
  conf: { fontSize: 19, fontFamily: mono, fontWeight: "700" },
  confLabel: { color: c.mutedForeground, fontSize: 8, fontFamily: mono, letterSpacing: 0.5 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  tfBlock: {
    marginTop: 12,
    gap: 6,
    backgroundColor: c.elevated,
    borderRadius: 10,
    padding: 10,
  },
  tfRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  tfTag: {
    backgroundColor: "rgba(77,141,255,0.14)",
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    minWidth: 34,
    alignItems: "center",
  },
  tfTagText: { color: c.info, fontSize: 9, fontFamily: mono, fontWeight: "700" },
  tfLabel: { color: c.mutedForeground, fontSize: 10, width: 92 },
  tfValue: { color: c.foreground, fontSize: 10, fontFamily: mono, flex: 1 },
  reasons: { marginTop: 10, gap: 4 },
  reasonRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  reasonText: { color: c.mutedForeground, fontSize: 11, flex: 1, lineHeight: 15 },
  more: { color: c.info, fontSize: 10, fontFamily: mono, marginTop: 2 },
});
