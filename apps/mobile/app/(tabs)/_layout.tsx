import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { StyleSheet } from "react-native";

import { useColors } from "@/design/theme";
import { size, type } from "@/design/tokens";
import { useClientOnlyValue } from "@/components/useClientOnlyValue";

type FeatherName = keyof typeof Feather.glyphMap;

function tabIcon(name: FeatherName) {
  return ({ color, focused }: { color: import("react-native").ColorValue; focused: boolean; size: number }) => (
    <Feather name={name} size={focused ? 24 : 23} color={color as string} />
  );
}

export default function TabLayout() {
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textSubtle,
        tabBarStyle: {
          backgroundColor: c.bg,
          borderTopColor: c.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: size.tabBar + 34, // room for the home-indicator inset
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: type.caption.fontSize, fontWeight: "500", letterSpacing: 0.1 },
        // Disable the static render of the header on web to prevent a
        // hydration error in React Navigation.
        headerShown: useClientOnlyValue(false, true),
        headerStyle: { backgroundColor: c.bg },
        headerTitleStyle: { fontWeight: "600", color: c.text, fontSize: type.title3.fontSize },
        headerTintColor: c.accent,
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Home", headerShown: false, tabBarIcon: tabIcon("home") }}
      />
      <Tabs.Screen
        name="classes"
        options={{ title: "Classes", headerShown: false, tabBarIcon: tabIcon("users") }}
      />
      <Tabs.Screen
        name="practice"
        options={{ title: "Practice", headerShown: false, tabBarIcon: tabIcon("code") }}
      />
      <Tabs.Screen
        name="quizzes"
        options={{ title: "Quizzes", headerShown: false, tabBarIcon: tabIcon("check-square") }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profile", headerShown: false, tabBarIcon: tabIcon("user") }}
      />
    </Tabs>
  );
}
