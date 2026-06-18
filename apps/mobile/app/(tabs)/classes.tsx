import { useCallback, useEffect, useState } from "react";
import { RefreshControl, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { api, type EnrolledClass } from "@/lib/api";
import { joinByCode } from "@/lib/classJoin";
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
    await joinByCode({
      code: trimmed,
      email: user?.email,
      name: user?.displayName,
      onJoined: (classId) => {
        setCode("");
        router.push(`/class/${classId}`);
      },
      onError: setError,
      onRefresh: load,
    });
    setJoining(false);
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

        {/* Join with a QR scan or a code */}
        <Card style={{ marginBottom: space[8] }}>
          <Text variant="bodyEm">Join a class</Text>
          <Text variant="footnote" color="textMuted" style={{ marginTop: space[1] }}>
            Scan your teacher&apos;s QR code, or enter the class / group code they shared.
          </Text>
          <Button
            label="Scan QR code"
            leftIcon="maximize"
            onPress={() => router.push("/scan" as Href)}
            style={{ marginTop: space[4] }}
          />
          <View style={{ flexDirection: "row", gap: space[2], marginTop: space[3] }}>
            <Input
              value={code}
              onChangeText={setCode}
              placeholder="or enter a code, e.g. ABX4T9"
              autoCapitalize="characters"
              autoCorrect={false}
              onSubmitEditing={join}
              returnKeyType="go"
              style={{ letterSpacing: 1, fontWeight: "600" }}
              containerStyle={{ flex: 1 }}
            />
            <Button
              label="Join"
              variant="secondary"
              onPress={join}
              loading={joining}
              disabled={!code.trim()}
            />
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
