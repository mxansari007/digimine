import { Stack } from "expo-router";
import { useColors } from "@/design/theme";

/**
 * Teacher portal navigation. A self-contained Stack under /teacher/* (a real
 * path segment, not a route group, so it never collides with the student
 * /class/[classId] or tab routes). The dashboard paints its own header; every
 * class-scoped screen uses the native header. Reached only when AuthContext
 * resolves the signed-in user to a teacher.
 */
export default function TeacherLayout() {
  const c = useColors();
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: c.bg },
        headerTitleStyle: { color: c.text },
        headerTintColor: c.accent,
        contentStyle: { backgroundColor: c.bg },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="class/[classId]/index" options={{ title: "Class", headerBackTitle: "Dashboard" }} />
      <Stack.Screen name="class/[classId]/students" options={{ title: "Students", headerBackTitle: "Class" }} />
      <Stack.Screen name="class/[classId]/content" options={{ title: "Content", headerBackTitle: "Class" }} />
      <Stack.Screen name="class/[classId]/announce" options={{ title: "Announce", headerBackTitle: "Class" }} />
      <Stack.Screen name="class/[classId]/analytics" options={{ title: "Analytics", headerBackTitle: "Class" }} />
      <Stack.Screen name="student/[studentId]" options={{ title: "Student", headerBackTitle: "Students" }} />
    </Stack>
  );
}
