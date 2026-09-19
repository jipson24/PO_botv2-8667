import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { mono } from "@/constants/theme";

export default function TabLayout() {
  const colors = useColors();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarLabelStyle: { fontSize: 10, fontFamily: mono, letterSpacing: 0.2 },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Сигналы",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "pulse" : "pulse-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="pairs"
        options={{
          title: "Пары",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "stats-chart" : "stats-chart-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "История",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "time" : "time-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Настройки",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "options" : "options-outline"} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
