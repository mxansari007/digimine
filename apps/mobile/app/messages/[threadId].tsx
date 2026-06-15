import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams } from "expo-router";
import { api, ApiError, type DmConversation, type DmMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/design/theme";
import { radius, space, type as typeScale } from "@/design/tokens";
import {
  Button,
  Chip,
  Icon,
  ListSkeleton,
  PressableScale,
  Text,
} from "@/design/ui";
import { timeAgo } from "@/lib/format";

const REPORT_REASONS = ["Spam", "Harassment or bullying", "Inappropriate content", "Cheating / academic dishonesty", "Other"];

export default function ChatScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const { user } = useAuth();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [convo, setConvo] = useState<DmConversation | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [reportDetails, setReportDetails] = useState("");
  const [reporting, setReporting] = useState(false);

  const listRef = useRef<FlatList<DmMessage>>(null);
  const lastAtRef = useRef<string | null>(null);
  const idsRef = useRef<Set<string>>(new Set());

  const load = useCallback(
    async (incremental: boolean) => {
      if (!threadId) return;
      try {
        const res = await api.messages(threadId, incremental ? lastAtRef.current : null);
        setConvo(res.conversation);
        const incoming = res.messages || [];
        if (incoming.length > 0) {
          lastAtRef.current = incoming[incoming.length - 1].createdAt;
          setMessages((prev) => {
            if (!incremental) {
              incoming.forEach((m) => idsRef.current.add(m.id));
              return incoming;
            }
            const fresh = incoming.filter((m) => !idsRef.current.has(m.id));
            fresh.forEach((m) => idsRef.current.add(m.id));
            return fresh.length ? [...prev, ...fresh] : prev;
          });
        } else if (!incremental) {
          setMessages([]);
        }
      } catch (e: any) {
        if (!incremental) setError(e?.message || "Couldn't load this conversation.");
      } finally {
        if (!incremental) setLoading(false);
      }
    },
    [threadId]
  );

  useEffect(() => {
    load(false);
    const timer = setInterval(() => load(true), 6000);
    return () => clearInterval(timer);
  }, [load]);

  const send = async () => {
    const text = draft.trim();
    if (!threadId || !text || sending) return;
    setSending(true);
    setDraft("");
    try {
      const { message } = await api.sendMessage(threadId, text);
      idsRef.current.add(message.id);
      lastAtRef.current = message.createdAt;
      setMessages((prev) => [...prev, message]);
    } catch (e: any) {
      setDraft(text);
      if (e instanceof ApiError && e.status === 403) {
        load(false);
        Alert.alert("Can't send", e.body?.error || "This message couldn't be sent.");
      } else {
        Alert.alert("Can't send", e?.message || "Something went wrong.");
      }
    } finally {
      setSending(false);
    }
  };

  const toggleBlock = async () => {
    if (!threadId || !convo) return;
    setMenuOpen(false);
    const action = convo.blockedByMe ? "unblock" : "block";
    try {
      const { conversation } = await api.setBlock(threadId, action);
      setConvo(conversation);
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Couldn't update block status.");
    }
  };

  const confirmBlock = () => {
    if (!convo) return;
    if (convo.blockedByMe) return toggleBlock();
    Alert.alert(`Block ${convo.otherName}?`, "They won't be able to message you, and you won't be able to message them until you unblock.", [
      { text: "Cancel", style: "cancel", onPress: () => setMenuOpen(false) },
      { text: "Block", style: "destructive", onPress: toggleBlock },
    ]);
  };

  const submitReport = async () => {
    if (!threadId || !reportReason || reporting) return;
    setReporting(true);
    try {
      await api.reportConversation(threadId, reportReason, reportDetails.trim());
      setReportOpen(false);
      setReportReason(null);
      setReportDetails("");
      Alert.alert("Report sent", "Your teacher has been notified and will review this conversation.");
    } catch (e: any) {
      Alert.alert("Couldn't send report", e?.message || "Try again in a moment.");
    } finally {
      setReporting(false);
    }
  };

  const composerNote = convo?.blockedByMe
    ? "You blocked this person."
    : convo?.blockedByOther
      ? "You can't reply to this conversation."
      : null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <Stack.Screen
        options={{
          title: convo?.otherName || "Chat",
          headerRight: () => (
            <PressableScale onPress={() => setMenuOpen(true)} scaleTo={0.9} style={{ paddingHorizontal: space[2] }}>
              <Icon name="more-horizontal" size={22} color="text" />
            </PressableScale>
          ),
        }}
      />

      {convo && convo.otherRole !== "student" ? (
        <View style={{ backgroundColor: c.accentSubtle, paddingHorizontal: space[4], paddingVertical: space[2] }}>
          <Text variant="caption" color="accentText" align="center">
            {convo.otherName} is a teacher in your class
          </Text>
        </View>
      ) : null}

      {loading ? (
        <ListSkeleton rows={6} />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: space[4], paddingBottom: space[4], flexGrow: 1 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <Text variant="footnote" color="textSubtle" align="center" style={{ marginTop: space[16] }}>
              {error || "No messages yet — say hello 👋"}
            </Text>
          }
          renderItem={({ item }) => {
            const mine = item.senderId === user?.uid;
            return (
              <View style={{ flexDirection: "row", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: space[2] }}>
                <View
                  style={{
                    maxWidth: "80%",
                    borderRadius: radius.lg,
                    paddingHorizontal: space[3],
                    paddingVertical: space[2],
                    backgroundColor: mine ? c.accent : c.surface,
                    borderWidth: mine ? 0 : 0.5,
                    borderColor: c.border,
                    borderBottomRightRadius: mine ? radius.sm : radius.lg,
                    borderBottomLeftRadius: mine ? radius.lg : radius.sm,
                  }}
                >
                  <Text variant="callout" style={{ color: mine ? "#fff" : c.text }}>
                    {item.text}
                  </Text>
                  <Text variant="caption" style={{ color: mine ? "rgba(255,255,255,0.7)" : c.textSubtle, alignSelf: "flex-end", marginTop: 2 }}>
                    {timeAgo(item.createdAt)}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Composer / blocked bar */}
      {composerNote ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space[3], padding: space[4], paddingBottom: space[4] + insets.bottom, backgroundColor: c.surface, borderTopWidth: 0.5, borderTopColor: c.border }}>
          <Text variant="footnote" color="textMuted">{composerNote}</Text>
          {convo?.blockedByMe ? <Button label="Unblock" size="compact" variant="secondary" onPress={toggleBlock} /> : null}
        </View>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space[2], padding: space[3], paddingBottom: space[3] + insets.bottom, backgroundColor: c.surface, borderTopWidth: 0.5, borderTopColor: c.border }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={`Message ${convo?.otherName?.split(" ")[0] || ""}…`}
            placeholderTextColor={c.textSubtle}
            multiline
            maxLength={2000}
            style={{
              flex: 1,
              backgroundColor: c.surfaceAlt,
              borderRadius: radius.lg,
              paddingHorizontal: space[4],
              paddingVertical: space[3],
              fontSize: typeScale.callout.fontSize,
              color: c.text,
              maxHeight: 120,
            }}
          />
          <PressableScale
            onPress={send}
            disabled={!draft.trim() || sending}
            scaleTo={0.9}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.accent, alignItems: "center", justifyContent: "center", opacity: !draft.trim() || sending ? 0.4 : 1 }}
          >
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Icon name="arrow-up" size={20} tint="#fff" />}
          </PressableScale>
        </View>
      )}

      {/* Overflow menu */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <PressableScale style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }} onPress={() => setMenuOpen(false)} scaleTo={1}>
          <View style={{ backgroundColor: c.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space[4], paddingBottom: space[4] + insets.bottom }}>
            <Text variant="caption" color="textSubtle" align="center" style={{ marginBottom: space[2] }}>
              {convo?.otherName}
            </Text>
            <SheetRow icon="flag" title="Report to teacher" subtitle="Flag this conversation for your teacher to review" onPress={() => { setMenuOpen(false); setReportOpen(true); }} />
            <SheetRow
              icon="slash"
              title={`${convo?.blockedByMe ? "Unblock" : "Block"} ${convo?.otherName?.split(" ")[0] || ""}`}
              subtitle={convo?.blockedByMe ? "Allow messages between you again" : "Stop messages in both directions"}
              danger={!convo?.blockedByMe}
              onPress={confirmBlock}
            />
            <Button label="Cancel" variant="secondary" onPress={() => setMenuOpen(false)} style={{ marginTop: space[2] }} />
          </View>
        </PressableScale>
      </Modal>

      {/* Report modal */}
      <Modal visible={reportOpen} transparent animationType="slide" onRequestClose={() => setReportOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: c.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space[5], paddingBottom: space[5] + insets.bottom, gap: space[3] }}>
            <Text variant="title3">Report {convo?.otherName}</Text>
            <Text variant="footnote" color="textMuted">This goes to your class teacher with the recent messages for context.</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
              {REPORT_REASONS.map((r) => (
                <Chip key={r} label={r} selected={reportReason === r} onPress={() => setReportReason(r)} />
              ))}
            </View>
            <TextInput
              value={reportDetails}
              onChangeText={setReportDetails}
              placeholder="Add details (optional)…"
              placeholderTextColor={c.textSubtle}
              multiline
              maxLength={1000}
              style={{ backgroundColor: c.surfaceAlt, borderRadius: radius.md, paddingHorizontal: space[3], paddingVertical: space[3], fontSize: typeScale.footnote.fontSize, color: c.text, minHeight: 72, textAlignVertical: "top" }}
            />
            <View style={{ flexDirection: "row", gap: space[2] }}>
              <Button label="Cancel" variant="secondary" onPress={() => setReportOpen(false)} style={{ flex: 1 }} />
              <Button label="Send report" variant="danger" loading={reporting} disabled={!reportReason} onPress={submitReport} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function SheetRow({ icon, title, subtitle, onPress, danger }: { icon: React.ComponentProps<typeof Icon>["name"]; title: string; subtitle: string; onPress: () => void; danger?: boolean }) {
  const c = useColors();
  return (
    <PressableScale onPress={onPress} scaleTo={0.99} style={{ flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[3] }}>
      <Icon name={icon} size={20} tint={danger ? c.danger : c.text} />
      <View style={{ flex: 1 }}>
        <Text variant="callout" style={{ fontWeight: "600", color: danger ? c.danger : c.text }}>
          {title}
        </Text>
        <Text variant="footnote" color="textMuted">
          {subtitle}
        </Text>
      </View>
    </PressableScale>
  );
}
