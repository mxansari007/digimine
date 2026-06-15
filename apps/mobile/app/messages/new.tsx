import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, ScrollView, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { api, type ClassMember, type EnrolledClass } from "@/lib/api";
import { useColors } from "@/design/theme";
import { space } from "@/design/tokens";
import {
  Avatar,
  Chip,
  EmptyState,
  ErrorState,
  ListItem,
  ListSkeleton,
  Screen,
  SearchInput,
  Text,
} from "@/design/ui";

export default function NewMessageScreen() {
  const router = useRouter();
  const c = useColors();
  const [classes, setClasses] = useState<EnrolledClass[]>([]);
  const [activeClass, setActiveClass] = useState<string | null>(null);
  const [members, setMembers] = useState<ClassMember[]>([]);
  const [me, setMe] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await api.myEnrollments();
        const live = (res.classes || []).filter((x) => !x.isArchived);
        setClasses(live);
        if (live[0]) setActiveClass(live[0].classId);
      } catch (e: any) {
        setError(e?.message || "Couldn't load your classes.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadMembers = useCallback(async (classId: string) => {
    setLoadingMembers(true);
    setError(null);
    try {
      const res = await api.classMembers(classId);
      setMe(res.me);
      setMembers(res.members || []);
    } catch (e: any) {
      setError(e?.message || "Couldn't load class members.");
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }, []);

  useEffect(() => {
    if (activeClass) loadMembers(activeClass);
  }, [activeClass, loadMembers]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => m.id !== me).filter((m) => !q || m.name.toLowerCase().includes(q));
  }, [members, me, search]);

  const openChat = async (member: ClassMember) => {
    if (openingId) return;
    setOpeningId(member.id);
    setError(null);
    try {
      const { conversation } = await api.openConversation(member.id);
      router.replace(`/messages/${conversation.id}`);
    } catch (e: any) {
      setError(e?.message || "Couldn't open the conversation.");
    } finally {
      setOpeningId(null);
    }
  };

  if (loading) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: "New message" }} />
        <ListSkeleton rows={5} />
      </Screen>
    );
  }
  if (classes.length === 0) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: "New message" }} />
        <EmptyState icon="users" title="Join a class first" body="You can message classmates and teachers from classes you've joined." />
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: "New message" }} />

      {classes.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space[2], paddingHorizontal: space[4], paddingVertical: space[3] }}
          style={{ flexGrow: 0, borderBottomWidth: 0.5, borderBottomColor: c.border }}
        >
          {classes.map((cl) => (
            <Chip key={cl.classId} label={cl.className} selected={activeClass === cl.classId} onPress={() => setActiveClass(cl.classId)} />
          ))}
        </ScrollView>
      ) : null}

      <View style={{ padding: space[4] }}>
        <SearchInput value={search} onChangeText={setSearch} placeholder="Search people…" />
      </View>

      {error ? (
        <View style={{ paddingHorizontal: space[4] }}>
          <ErrorState message={error} onRetry={() => activeClass && loadMembers(activeClass)} />
        </View>
      ) : null}

      {loadingMembers ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: space[8] }} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: space[16] }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<EmptyState icon="users" title="No one to message" body="This class has no other members yet." />}
          renderItem={({ item }) => (
            <ListItem
              title={item.name}
              subtitle={[item.headline, item.college].filter(Boolean).join(" · ") || undefined}
              left={<Avatar name={item.name} role={item.role} />}
              onPress={() => openChat(item)}
              trailing={
                openingId === item.id ? (
                  <ActivityIndicator size="small" color={c.accent} />
                ) : item.role === "teacher" ? (
                  <Chip label="Teacher" tone="accent" />
                ) : (
                  <Text variant="subhead" color="accentText">
                    Message
                  </Text>
                )
              }
            />
          )}
        />
      )}
    </Screen>
  );
}
