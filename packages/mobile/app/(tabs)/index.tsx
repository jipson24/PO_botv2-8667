import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Colors, mono } from "@/constants/theme";
import { agoLabel } from "@/lib/format";
import { useOverview, useScanNow, useSignals } from "@/queries/signals";
import { SignalCard } from "@/components/signal-card";
import { Chip, Empty, Loading, Stat } from "@/components/ui";

const c = Colors.dark;
type Filter = "all" | "call" | "put";

export default function SignalsScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const overview = useOverview();
  const signals = useSignals({ limit: 40, direction: filter === "all" ? undefined : filter });
  const scanNow = useScanNow();

  const o = overview.data;
  const list = useMemo(() => signals.data ?? [], [signals.data]);
  const blocked = (o?.pairs.waiting ?? 0) > 0 && (o?.pairs.ready ?? 0) === 0;

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={s.screen}>
      <FlatList
        data={list}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={signals.isFetching && !signals.isLoading}
            onRefresh={() => {
              void signals.refetch();
              void overview.refetch();
            }}
            tintColor={c.primary}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <View style={s.header}>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>Pocket Signals</Text>
                <View style={s.statusLine}>
                  <View
                    style={[
                      s.dot,
                      { backgroundColor: o?.scannerRunning ? c.call : c.mutedForeground },
                    ]}
                  />
                  <Text style={s.statusText}>
                    {o?.scannerRunning ? "сканер активен" : "сканер остановлен"}
                    {o?.settings ? ` · ${o.settings.scanIntervalSec}с` : ""}
                    {o?.lastRun ? ` · ${agoLabel(o.lastRun.startedAt)}` : ""}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => scanNow.mutate({})}
                disabled={scanNow.isPending}
                style={({ pressed }) => [s.scanBtn, (pressed || scanNow.isPending) && { opacity: 0.6 }]}
              >
                <Ionicons
                  name={scanNow.isPending ? "sync" : "search"}
                  size={14}
                  color={c.primaryForeground}
                />
                <Text style={s.scanBtnText}>
                  {scanNow.isPending ? "скан…" : "Сканировать"}
                </Text>
              </Pressable>
            </View>

            <View style={s.statsRow}>
              <Stat
                label="сигналов 24ч"
                value={String(o?.signalsToday ?? 0)}
                hint={`всего ${o?.totalSignals ?? 0}`}
              />
              <Stat label="call" value={String(o?.callsToday ?? 0)} tone="call" hint="за 24ч" />
              <Stat label="put" value={String(o?.putsToday ?? 0)} tone="put" hint="за 24ч" />
            </View>
            <View style={s.statsRow}>
              <Stat
                label="пары в диапазоне"
                value={String(o?.pairs.inRange ?? 0)}
                tone="gold"
                hint={`фид ok: ${o?.pairs.ready ?? 0} / ждут ${o?.pairs.waiting ?? 0}`}
              />
              <Stat
                label="порог"
                value={`${o?.settings.minConfidence ?? "—"}%`}
                tone="info"
                hint={`payout ${o?.settings.minPayout ?? "—"}–${o?.settings.maxPayout ?? "—"}%`}
              />
              <Stat
                label="подписчики tg"
                value={String(o?.subscribers ?? 0)}
                hint={o?.settings.telegramEnabled ? "рассылка вкл" : "рассылка выкл"}
              />
            </View>

            {scanNow.data ? (
              <View style={s.scanResult}>
                <Text style={s.scanResultText}>
                  проход: {scanNow.data.scanned} пар · {scanNow.data.signalsFound} сигн. ·{" "}
                  {scanNow.data.errors} ошибок
                </Text>
                {scanNow.data.note ? <Text style={s.scanNote}>{scanNow.data.note}</Text> : null}
              </View>
            ) : null}

            {blocked ? (
              <View style={s.warn}>
                <Ionicons name="warning-outline" size={16} color={c.gold} />
                <Text style={s.warnText}>
                  В диапазоне payout {o?.settings.minPayout}–{o?.settings.maxPayout}% сейчас
                  только OTC-пары, а их свечи закрыты до добавления cookie ssid Pocket Option.
                  Сканер работает по обычным парам с публичным фидом.
                </Text>
              </View>
            ) : null}

            <View style={s.filters}>
              {(
                [
                  ["all", "все"],
                  ["call", "call"],
                  ["put", "put"],
                ] as [Filter, string][]
              ).map(([key, label]) => {
                const active = filter === key;
                const color = key === "call" ? c.call : key === "put" ? c.put : c.foreground;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setFilter(key)}
                    style={[
                      s.filterBtn,
                      active && { borderColor: color, backgroundColor: "rgba(255,255,255,0.04)" },
                    ]}
                  >
                    <Text
                      style={[s.filterText, { color: active ? color : c.mutedForeground }]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
              <View style={{ flex: 1 }} />
              <Chip label={`${list.length} в ленте`} tone="muted" />
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ marginTop: 12 }}>
            <SignalCard signal={item} onPress={() => router.push(`/signal/${item.id}`)} />
          </View>
        )}
        ListEmptyComponent={
          signals.isLoading ? (
            <Loading text="тянем сигналы…" />
          ) : (
            <Empty text={"Сигналов пока нет.\nСканер ждёт конфлюэнс 30m → 15m → 5m."} />
          )
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  content: { padding: 16, paddingBottom: 32 },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { color: c.foreground, fontSize: 22, fontWeight: "700", letterSpacing: -0.4 },
  statusLine: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  dot: { width: 7, height: 7, borderRadius: 999 },
  statusText: { color: c.mutedForeground, fontSize: 10, fontFamily: mono },
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: c.primary,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  scanBtnText: { color: c.primaryForeground, fontSize: 12, fontWeight: "700" },
  statsRow: { flexDirection: "row", gap: 8 },
  scanResult: {
    backgroundColor: c.elevated,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    padding: 10,
    gap: 3,
  },
  scanResultText: { color: c.foreground, fontSize: 11, fontFamily: mono },
  scanNote: { color: c.mutedForeground, fontSize: 10, fontFamily: mono, lineHeight: 14 },
  warn: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "rgba(245,196,81,0.08)",
    borderColor: "rgba(245,196,81,0.3)",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 11,
  },
  warnText: { color: c.gold, fontSize: 11, lineHeight: 16, flex: 1 },
  filters: { flexDirection: "row", alignItems: "center", gap: 6 },
  filterBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  filterText: { fontSize: 11, fontFamily: mono, letterSpacing: 0.4 },
});
