import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { Platform, useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { getNotificationsModule, registerForPush } from "@/lib/push";
import { ThemeProvider as DesignThemeProvider } from "@/design/theme";
import { colors, colorsDark } from "@/design/tokens";

export { ErrorBoundary } from "expo-router";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

// Keep the splash up until the persisted Firebase session has been restored,
// so the app never flashes the login screen at an already-signed-in student.
SplashScreen.preventAutoHideAsync();

/** Native nav/header theme, synced to the design tokens + system scheme. */
function navTheme(isDark: boolean) {
  const t = isDark ? colorsDark : colors;
  const base = isDark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: t.accent,
      background: t.bg,
      card: t.bg,
      text: t.text,
      border: t.border,
    },
  };
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <DesignThemeProvider>
        <AuthProvider>
          <RootLayoutNav />
        </AuthProvider>
      </DesignThemeProvider>
    </SafeAreaProvider>
  );
}

function RootLayoutNav() {
  const { user, loading, isTeacher } = useAuth();
  const router = useRouter();

  // Hold the splash until both the session AND (for signed-in users) the role
  // probe have resolved — otherwise a teacher would flash the student tabs.
  useEffect(() => {
    if (!loading && (!user || isTeacher !== null)) SplashScreen.hideAsync();
  }, [loading, user, isTeacher]);

  // Best-effort push registration once signed in. No-ops on the emulator /
  // Expo Go (registerForPush returns null) — only lights up in a real build.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const token = await registerForPush();
      if (token && !cancelled) api.registerDevice(token, Platform.OS).catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Deep-link when a delivered push is tapped (foreground/background + cold
  // start). Mirrors the in-app notification center's tap routing.
  useEffect(() => {
    if (!user) return;
    const Notifications = getNotificationsModule();
    if (!Notifications) return;
    const route = (raw: any) => {
      const d = (raw || {}) as Record<string, any>;
      if (d.type === "dm" && d.threadId) router.push(`/messages/${d.threadId}`);
      else if (d.type === "resource_shared" && d.classId) router.push(`/class/${d.classId}/resources`);
      else if (d.classId && d.threadId) router.push(`/class/${d.classId}/thread/${d.threadId}`);
      else if (d.classId) router.push(`/class/${d.classId}`);
    };
    const sub = Notifications.addNotificationResponseReceivedListener((r) =>
      route(r.notification.request.content.data)
    );
    // Launched by tapping a notification while the app was closed.
    Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) route(r.notification.request.content.data);
    });
    return () => sub.remove();
  }, [user, router]);

  const isDark = useColorScheme() === "dark";

  if (loading) return null;
  // Signed in but role not yet known — keep the splash (returned null) up.
  if (user && isTeacher === null) return null;

  return (
    <ThemeProvider value={navTheme(isDark)}>
      <Stack screenOptions={{ headerShadowVisible: false }}>
        {/* Teachers get the teacher portal (under /teacher/*). */}
        <Stack.Protected guard={!!user && isTeacher === true}>
          <Stack.Screen name="teacher" options={{ headerShown: false }} />
        </Stack.Protected>
        {/* Students (and anyone whose role didn't resolve to teacher) get the tabs. */}
        <Stack.Protected guard={!!user && isTeacher !== true}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {/* Quiz room paints its own header (progress bar + timer). */}
          <Stack.Screen name="quiz/[attemptId]" options={{ headerShown: false }} />
          <Stack.Screen name="test/[attemptId]" options={{ title: "Result", headerBackTitle: "Back" }} />
          <Stack.Screen name="problem/[slug]" options={{ headerBackTitle: "Practice" }} />
          <Stack.Screen name="interviews" options={{ title: "Mock Interviews", headerBackTitle: "Home" }} />
          <Stack.Screen name="interview/[id]" options={{ headerBackTitle: "Interviews" }} />
          {/* Classroom: hub → course reader / community threads → thread. */}
          <Stack.Screen name="class/[classId]/index" options={{ headerBackTitle: "Classes" }} />
          <Stack.Screen name="class/[classId]/content/[type]" options={{ headerBackTitle: "Class" }} />
          <Stack.Screen name="class/[classId]/threads" options={{ headerBackTitle: "Class" }} />
          <Stack.Screen name="class/[classId]/thread/[threadId]" options={{ headerBackTitle: "Community" }} />
          <Stack.Screen name="course/[courseId]" options={{ headerBackTitle: "Class" }} />
          {/* Messaging + notifications. */}
          <Stack.Screen name="messages/index" options={{ headerBackTitle: "Home" }} />
          <Stack.Screen name="messages/new" options={{ headerBackTitle: "Messages", presentation: "modal" }} />
          <Stack.Screen name="messages/[threadId]" options={{ headerBackTitle: "Messages" }} />
          <Stack.Screen name="notifications" options={{ headerBackTitle: "Home" }} />
          <Stack.Screen name="notification-settings" options={{ title: "Notifications", headerBackTitle: "Profile" }} />
          <Stack.Screen name="class/[classId]/resources" options={{ headerBackTitle: "Class" }} />
          <Stack.Screen name="timetable" options={{ title: "Timetable", headerBackTitle: "Classes" }} />
          <Stack.Screen name="schedule" options={{ title: "Schedule", headerBackTitle: "Home" }} />
          <Stack.Screen
            name="jobs"
            options={{
              title: "Job Map",
              headerBackTitle: "Home",
              headerStyle: { backgroundColor: "#0b1220" },
              headerTintColor: "#e2e8f0",
              headerTitleStyle: { color: "#ffffff" },
            }}
          />
          <Stack.Screen name="contests" options={{ title: "Compete", headerBackTitle: "Home" }} />
          <Stack.Screen name="contest/[contestId]" options={{ title: "Contest", headerBackTitle: "Compete" }} />
        </Stack.Protected>
        <Stack.Protected guard={!user}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
