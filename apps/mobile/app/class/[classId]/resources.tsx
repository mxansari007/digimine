import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import { useVideoPlayer, VideoView } from "expo-video";
import { api, ApiError, type ClassResource, type CreateResourceInput } from "@/lib/api";
import { auth } from "@/lib/firebase";
import { resourceStoragePath, uploadFile } from "@/lib/upload";
import { useColors } from "@/design/theme";
import { radius, space } from "@/design/tokens";
import {
  Avatar,
  Button,
  Chip,
  EmptyState,
  Icon,
  type IconName,
  Input,
  ListSkeleton,
  PressableScale,
  Screen,
  Text,
} from "@/design/ui";
import { formatBytes, timeAgo } from "@/lib/format";

// MIME types the document picker offers (decks, PDFs, docs, sheets).
const DOC_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.ms-powerpoint",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "application/zip",
];

const KIND_ICON: Record<string, IconName> = {
  document: "file-text",
  video: "film",
  image: "image",
  link: "link",
};

type PickedFile = { uri: string; name: string; mimeType: string; size: number; kind: string };

// Client upload caps. We buffer the file into a Blob before upload, so an
// oversized video would OOM the JS heap — guard before we ever touch it.
// (Kept under the storage.rules ceilings; large videos should be shared as a
// link to a hosted player instead.)
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_FILE_BYTES = 40 * 1024 * 1024;

// Extension → MIME for the document types the picker offers, so a file with no
// reported mimeType still gets a concrete content-type the storage rules allow
// (they reject application/octet-stream).
const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
  csv: "text/csv",
  zip: "application/zip",
};

function kindForMime(mime: string): string {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  return "document";
}

function mimeFromName(name: string, fallback: string): string {
  const ext = (name.split(".").pop() || "").toLowerCase();
  return EXT_MIME[ext] || fallback;
}

/** Returns an error message if the file is too big to upload, else null. */
function sizeError(kind: string, size: number): string | null {
  if (!size) return null; // unknown size — can't guard
  const max = kind === "video" ? MAX_VIDEO_BYTES : MAX_FILE_BYTES;
  if (size <= max) return null;
  return (
    `That ${kind} is ${formatBytes(size)} — too large to upload from mobile (max ${formatBytes(max)}). ` +
    (kind === "video" ? "Share a link to a hosted video instead." : "")
  ).trim();
}

export default function ResourcesScreen() {
  const c = useColors();
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const cid = String(classId);
  const me = auth.currentUser?.uid || "";

  const [items, setItems] = useState<ClassResource[]>([]);
  const [role, setRole] = useState<string>("student");
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [shareOpen, setShareOpen] = useState(false);
  const [viewing, setViewing] = useState<ClassResource | null>(null);

  const isModerator = role === "teacher" || role === "institute_admin";
  const canShare = !(role === "student" && muted);

  const load = useCallback(async () => {
    if (!cid) return;
    setError(null);
    try {
      const res = await api.classResources(cid);
      setItems(res.resources || []);
      setRole(res.role || "student");
      setMuted(Boolean(res.block?.threads));
    } catch (e: any) {
      setError(e?.message || "Couldn't load resources.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cid]);

  useEffect(() => {
    load();
  }, [load]);

  const onShared = (r: ClassResource) => {
    // Prepend, then keep pinned items on top to match the server order.
    setItems((prev) => [r, ...prev].sort((a, b) => Number(b.isPinned) - Number(a.isPinned)));
    setShareOpen(false);
  };

  const openResource = async (r: ClassResource) => {
    if (r.kind === "image" || r.kind === "video") {
      setViewing(r);
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(r.fileUrl);
    } catch {
      Alert.alert("Couldn't open", "This resource couldn't be opened on your device.");
    }
  };

  const removeResource = (r: ClassResource) => {
    setItems((prev) => prev.filter((x) => x.id !== r.id));
    api.deleteResource(cid, r.id).catch(() => load());
  };

  const togglePin = async (r: ClassResource) => {
    const next = !r.isPinned;
    setItems((prev) =>
      [...prev.map((x) => (x.id === r.id ? { ...x, isPinned: next } : x))].sort(
        (a, b) => Number(b.isPinned) - Number(a.isPinned)
      )
    );
    try {
      await api.setResourcePin(cid, r.id, next ? "pin" : "unpin");
    } catch {
      load();
    }
  };

  const onLongPress = (r: ClassResource) => {
    const canRemove = r.uploaderId === me || isModerator;
    if (!canRemove && !isModerator) return;
    const buttons: any[] = [];
    if (isModerator) {
      buttons.push({ text: r.isPinned ? "Unpin" : "Pin to top", onPress: () => togglePin(r) });
    }
    if (canRemove) {
      buttons.push({
        text: "Remove",
        style: "destructive",
        onPress: () =>
          Alert.alert("Remove resource?", `"${r.title}" will be removed for everyone.`, [
            { text: "Cancel", style: "cancel" },
            { text: "Remove", style: "destructive", onPress: () => removeResource(r) },
          ]),
      });
    }
    buttons.push({ text: "Cancel", style: "cancel" });
    Alert.alert(r.title, undefined, buttons);
  };

  return (
    <Screen edges={[]}>
      <Stack.Screen
        options={{
          title: "Resources",
          headerRight: () =>
            canShare ? (
              <PressableScale
                onPress={() => setShareOpen(true)}
                scaleTo={0.95}
                style={{ paddingHorizontal: space[2] }}
              >
                <Text variant="footnote" color="accentText" style={{ fontWeight: "600" }}>
                  Share
                </Text>
              </PressableScale>
            ) : null,
        }}
      />

      <ScrollView
        style={{ flex: 1, backgroundColor: c.bg }}
        contentContainerStyle={{ paddingHorizontal: space[4], paddingTop: space[5], paddingBottom: space[16] }}
        showsVerticalScrollIndicator={false}
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
        <Text variant="body" color="textMuted" style={{ marginBottom: space[5] }}>
          Slide decks, PDFs, notes and recordings shared in this class. Tap to open; long-press
          yours to manage.
        </Text>

        {error ? (
          <Text variant="footnote" color="danger" style={{ marginBottom: space[4] }}>
            {error}
          </Text>
        ) : null}

        {loading ? (
          <ListSkeleton rows={5} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="folder"
            title="No resources yet"
            body={
              canShare
                ? "Be the first to share a deck, PDF or video with the class."
                : "When someone shares a file or link, it shows up here."
            }
            action={canShare ? <Button label="Share a resource" leftIcon="upload" onPress={() => setShareOpen(true)} /> : undefined}
          />
        ) : (
          <View style={{ gap: space[2] }}>
            {items.map((r) => (
              <ResourceRow
                key={r.id}
                r={r}
                onPress={() => openResource(r)}
                onLongPress={() => onLongPress(r)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {shareOpen ? (
        <ShareSheet
          classId={cid}
          uid={me}
          onClose={() => setShareOpen(false)}
          onShared={onShared}
        />
      ) : null}

      {viewing ? <ResourceViewer resource={viewing} onClose={() => setViewing(null)} /> : null}
    </Screen>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────

function ResourceRow({
  r,
  onPress,
  onLongPress,
}: {
  r: ClassResource;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const c = useColors();
  const isTeacher = r.uploaderRole !== "student";
  const meta = [
    r.uploaderName,
    formatBytes(r.size),
    timeAgo(r.createdAt),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      scaleTo={0.99}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space[3],
        padding: space[3],
        borderRadius: radius.lg,
        backgroundColor: c.surface,
        borderWidth: 0.5,
        borderColor: r.isPinned ? c.accent : c.border,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: radius.md,
          backgroundColor: isTeacher ? c.accentSubtle : c.surfaceAlt,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={KIND_ICON[r.kind] ?? "file"} size={18} color={isTeacher ? "accentText" : "textMuted"} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
          {r.isPinned ? <Icon name="bookmark" size={13} color="accentText" /> : null}
          <Text variant="subhead" numberOfLines={1} style={{ flexShrink: 1 }}>
            {r.title}
          </Text>
        </View>
        {r.description ? (
          <Text variant="footnote" color="textMuted" numberOfLines={1} style={{ marginTop: 1 }}>
            {r.description}
          </Text>
        ) : null}
        <Text variant="caption" color="textSubtle" numberOfLines={1} style={{ marginTop: 2 }}>
          {isTeacher ? "Teacher · " : ""}
          {meta}
        </Text>
      </View>
      <Icon name={r.kind === "link" ? "external-link" : "chevron-right"} size={18} color="textSubtle" />
    </PressableScale>
  );
}

// ── Share sheet (pick → form → upload) ───────────────────────────────────────

function ShareSheet({
  classId,
  uid,
  onClose,
  onShared,
}: {
  classId: string;
  uid: string;
  onClose: () => void;
  onShared: (r: ClassResource) => void;
}) {
  const c = useColors();
  const [mode, setMode] = useState<"menu" | "file" | "link">("menu");
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const baseName = (name: string) => name.replace(/\.[^.]+$/, "");

  const pickDocument = async () => {
    setErr(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: DOC_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      const name = a.name || "file";
      const mimeType = mimeFromName(name, a.mimeType || "application/octet-stream");
      const file: PickedFile = {
        uri: a.uri,
        name,
        mimeType,
        size: a.size || 0,
        kind: kindForMime(mimeType),
      };
      const tooBig = sizeError(file.kind, file.size);
      if (tooBig) {
        setErr(tooBig);
        return;
      }
      setPicked(file);
      setTitle(baseName(file.name));
      setMode("file");
    } catch (e: any) {
      setErr(e?.message || "Couldn't pick that file.");
    }
  };

  const pickMedia = async () => {
    setErr(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setErr("Allow photo & video access to upload media.");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        quality: 1,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      const fallbackMime = a.type === "video" ? "video/mp4" : "image/jpeg";
      const mimeType = a.mimeType || fallbackMime;
      const name = a.fileName || `${a.type || "media"}-${a.uri.split("/").pop() || "file"}`;
      const file: PickedFile = {
        uri: a.uri,
        name,
        mimeType,
        size: a.fileSize || 0,
        kind: kindForMime(mimeType),
      };
      const tooBig = sizeError(file.kind, file.size);
      if (tooBig) {
        setErr(tooBig);
        return;
      }
      setPicked(file);
      setTitle(baseName(file.name));
      setMode("file");
    } catch (e: any) {
      setErr(e?.message || "Couldn't pick that media.");
    }
  };

  const submit = async () => {
    if (busy) return;
    const t = title.trim();
    if (!t) {
      setErr("Give the resource a title.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      let payload: CreateResourceInput;
      if (mode === "link") {
        const url = linkUrl.trim();
        if (!/^https?:\/\//i.test(url)) {
          setErr("Enter a valid http(s) link.");
          setBusy(false);
          return;
        }
        payload = { title: t, description: description.trim(), link: url, fileName: t };
      } else {
        if (!picked) {
          setBusy(false);
          return;
        }
        setProgress(0.01);
        const path = resourceStoragePath(classId, uid, picked.name);
        const { url } = await uploadFile(picked.uri, path, picked.mimeType, setProgress);
        payload = {
          title: t,
          description: description.trim(),
          fileUrl: url,
          storagePath: path,
          fileName: picked.name,
          mimeType: picked.mimeType,
          size: picked.size,
        };
      }
      const { resource } = await api.createResource(classId, payload);
      onShared(resource);
    } catch (e: any) {
      if (e instanceof ApiError) setErr(e.body?.error || e.message);
      else setErr(e?.message || "Couldn't share that resource.");
      setBusy(false);
      setProgress(0);
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={busy ? undefined : onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View
            style={{
              backgroundColor: c.bg,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              paddingHorizontal: space[4],
              paddingTop: space[4],
              paddingBottom: space[8],
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space[4] }}>
              <Text variant="title3">
                {mode === "menu" ? "Share a resource" : mode === "link" ? "Share a link" : "Share file"}
              </Text>
              <PressableScale onPress={busy ? undefined : onClose} scaleTo={0.9}>
                <Icon name="x" size={22} color="textMuted" />
              </PressableScale>
            </View>

            {err ? (
              <Text variant="footnote" color="danger" style={{ marginBottom: space[3] }}>
                {err}
              </Text>
            ) : null}

            {mode === "menu" ? (
              <View style={{ gap: space[2] }}>
                <PickRow icon="file-text" label="Upload a document" sub="PDF, slides, Word, Excel" onPress={pickDocument} />
                <PickRow icon="image" label="Upload a photo or video" sub="From your library" onPress={pickMedia} />
                <PickRow icon="link" label="Share a link" sub="Any web URL" onPress={() => setMode("link")} />
              </View>
            ) : (
              <View style={{ gap: space[3] }}>
                {mode === "file" && picked ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: space[3],
                      padding: space[3],
                      borderRadius: radius.md,
                      backgroundColor: c.surfaceAlt,
                    }}
                  >
                    <Icon name={KIND_ICON[picked.kind] ?? "file"} size={20} color="textMuted" />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="subhead" numberOfLines={1}>{picked.name}</Text>
                      <Text variant="caption" color="textSubtle">{formatBytes(picked.size) || picked.mimeType}</Text>
                    </View>
                    {!busy ? (
                      <PressableScale onPress={() => { setPicked(null); setMode("menu"); }} scaleTo={0.9}>
                        <Text variant="footnote" color="accentText">Change</Text>
                      </PressableScale>
                    ) : null}
                  </View>
                ) : null}

                {mode === "link" ? (
                  <Input
                    placeholder="https://…"
                    value={linkUrl}
                    onChangeText={setLinkUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    leftIcon="link"
                    editable={!busy}
                  />
                ) : null}

                <Input placeholder="Title" value={title} onChangeText={setTitle} editable={!busy} />
                <Input
                  placeholder="Description (optional)"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  editable={!busy}
                  style={{ minHeight: 64 }}
                />

                {busy && mode === "file" ? (
                  <View style={{ gap: space[2] }}>
                    <View style={{ height: 4, borderRadius: 2, backgroundColor: c.surfaceAlt, overflow: "hidden" }}>
                      <View style={{ height: 4, width: `${Math.round(progress * 100)}%`, backgroundColor: c.accent }} />
                    </View>
                    <Text variant="caption" color="textSubtle">Uploading… {Math.round(progress * 100)}%</Text>
                  </View>
                ) : null}

                <Button label={busy ? "Sharing…" : "Share with class"} onPress={submit} loading={busy} disabled={busy} fullWidth />
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function PickRow({ icon, label, sub, onPress }: { icon: IconName; label: string; sub: string; onPress: () => void }) {
  const c = useColors();
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space[3],
        padding: space[4],
        borderRadius: radius.lg,
        backgroundColor: c.surface,
        borderWidth: 0.5,
        borderColor: c.border,
      }}
    >
      <View style={{ width: 38, height: 38, borderRadius: radius.md, backgroundColor: c.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={18} color="textMuted" />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="subhead">{label}</Text>
        <Text variant="caption" color="textSubtle">{sub}</Text>
      </View>
      <Icon name="chevron-right" size={18} color="textSubtle" />
    </PressableScale>
  );
}

// ── Viewer (image + video) ───────────────────────────────────────────────────

function ResourceViewer({ resource, onClose }: { resource: ClassResource; onClose: () => void }) {
  if (resource.kind === "video") return <VideoModal url={resource.fileUrl} title={resource.title} onClose={onClose} />;
  return <ImageModal url={resource.fileUrl} title={resource.title} onClose={onClose} />;
}

function ViewerChrome({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[3], paddingTop: space[12], paddingHorizontal: space[4], paddingBottom: space[3] }}>
          <PressableScale onPress={onClose} scaleTo={0.9}>
            <Icon name="x" size={24} tint="#fff" />
          </PressableScale>
          <Text variant="subhead" numberOfLines={1} style={{ flex: 1, color: "#fff" }}>{title}</Text>
        </View>
        {children}
      </View>
    </Modal>
  );
}

function ImageModal({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  return (
    <ViewerChrome title={title} onClose={onClose}>
      <Image source={{ uri: url }} style={{ flex: 1 }} resizeMode="contain" />
    </ViewerChrome>
  );
}

function VideoModal({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const player = useVideoPlayer(url, (p) => {
    p.play();
  });
  return (
    <ViewerChrome title={title} onClose={onClose}>
      <VideoView player={player} style={{ flex: 1 }} nativeControls contentFit="contain" />
    </ViewerChrome>
  );
}
