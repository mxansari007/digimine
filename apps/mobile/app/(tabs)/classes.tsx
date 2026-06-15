import { useCallback, useEffect, useState } from "react";
import { Alert, RefreshControl, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { api, ApiError, type EnrolledClass } from "@/lib/api";
import { useColors } from "@/design/theme";
import { space } from "@/design/tokens";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  ListItem,
  ListSkeleton,
  Screen,
  ScreenScroll,
  ScreenHeader,
  SectionHeader,
  Text,
} from "@/design/ui";

export default function ClassesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const c = useColors();
  const [classes, setClasses] = useState<EnrolledClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.myEnrollments();
      setClasses((res.classes || []).filter((x) => !x.isArchived));
    } catch (e: any) {
      setError(e?.message || "Couldn't load your classes.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const join = async () => {
    const trimmed = code.trim();
    if (!trimmed || joining) return;
    setJoining(true);
    setError(null);

    // Shared: redeem the code, refresh, and land in a class. A GROUP code
    // (GRP-…) enrolls in several classes and returns `classIds[]`; a class
    // code (CLS-…) returns a single `classId`.
    const doJoin = async () => {
      try {
        const res = await api.joinClass({
          inviteCode: trimmed,
          studentEmail: user?.email || undefined,
          studentName: user?.displayName || undefined,
        });
        setCode("");
        await load();
        const firstClass = res.classId || res.classIds?.[0];
        if (firstClass) router.push(`/class/${firstClass}`);
      } catch (e: any) {
        if (e instanceof ApiError && e.body?.code === "email_not_verified") {
          setError("Verify your email first (check your inbox), then try joining again.");
        } else {
          setError(e?.message || "Couldn't join the class.");
        }
      }
    };

    try {
      const found = await api.lookupInvite(trimmed);

      // Group code → joins all the section's subjects at once.
      if (found.group) {
        const g = found.group;
        const subjects = g.subjects?.length ? `\n\nSubjects: ${g.subjects.join(", ")}` : "";
        Alert.alert(
          `Join ${g.sectionName || g.name}?`,
          `Group ${g.name} · ${g.classCount} ${g.classCount === 1 ? "class" : "classes"}.${subjects}`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Join", onPress: doJoin },
          ]
        );
        return;
      }

      // Single class code.
      if (found.class) {
        const teacherName =
          found.teacher?.profile?.fullName || found.teacher?.profile?.displayName || "your teacher";
        const target = found.class;
        Alert.alert(
          `Join "${target.name}"?`,
          `Taught by ${teacherName}. You'll see its quizzes, courses and discussions here.`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Join class", onPress: doJoin },
          ]
        );
        return;
      }

      setError("No class or group matches that code — double-check it with your teacher.");
    } catch (e: any) {
      setError(e?.message || "Couldn't look up that code.");
    } finally {
      setJoining(false);
    }
  };

  return (
    <Screen>
      <ScreenScroll
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={c.textSubtle}
          />
        }
      >
        <ScreenHeader
          title="Classes"
          trailing={
            <IconButton
              icon="calendar"
              // Cast: typed-routes regenerates the Href union for /timetable on
              // the next `expo start`; the route file already exists.
              onPress={() => router.push("/timetable" as Href)}
            />
          }
        />

        {/* Join with a code */}
        <Card style={{ marginBottom: space[8] }}>
          <Text variant="bodyEm">Join a class</Text>
          <Text variant="footnote" color="textMuted" style={{ marginTop: space[1] }}>
            Enter the class or group code your teacher shared — a group code joins all your subjects.
          </Text>
          <View style={{ flexDirection: "row", gap: space[2], marginTop: space[4] }}>
            <Input
              value={code}
              onChangeText={setCode}
              placeholder="e.g. ABX4T9"
              autoCapitalize="characters"
              autoCorrect={false}
              onSubmitEditing={join}
              returnKeyType="go"
              style={{ letterSpacing: 1, fontWeight: "600" }}
              containerStyle={{ flex: 1 }}
            />
            <Button label="Join" onPress={join} loading={joining} disabled={!code.trim()} />
          </View>
        </Card>

        {error ? <ErrorState message={error} onRetry={load} /> : null}

        <SectionHeader title={classes.length ? `Enrolled · ${classes.length}` : "Enrolled"} />
        {loading ? (
          <ListSkeleton rows={3} />
        ) : classes.length === 0 ? (
          <EmptyState
            icon="users"
            title="No classes yet"
            body="Join with an invite code and your class's quizzes, notes and discussions all live here."
          />
        ) : (
          <Card padded={false} style={{ paddingHorizontal: space[4] }}>
            {classes.map((cl, i) => {
              const title = cl.subject || cl.className;
              const subtitle = [
                cl.teacherName,
                cl.sectionName || cl.teacherInstitute,
                cl.groupName ? `Group ${cl.groupName}` : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <ListItem
                  key={cl.classId}
                  title={title}
                  subtitle={subtitle}
                  left={<Avatar name={title} role="teacher" />}
                  showChevron
                  divider={i < classes.length - 1}
                  onPress={() => router.push(`/class/${cl.classId}`)}
                />
              );
            })}
          </Card>
        )}
      </ScreenScroll>
    </Screen>
  );
}
