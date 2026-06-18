/**
 * Lab recordings list — `/lab/recordings?classId=<id>`.
 *
 * View-only companion screen: lists a class's lab recordings (newest-first) via
 * `api.labRecordings(classId)` and taps through to the replay player at
 * `/lab/replay/<recordingId>`. The list call returns a denormalized
 * `sessionTitle` and the recording `status`/`durationSec`, but NEVER the signed
 * playback URL — that is minted only on the detail call inside the player.
 *
 * Registered with a header (title "Lab recordings") in `_layout.tsx`, so this
 * screen renders inside the default Stack header — mirroring the class
 * `resources.tsx` list chrome (Screen + ScrollView + RefreshControl +
 * ListSkeleton/EmptyState + tappable rows).
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  api,
  type LabRecordingStatus,
  type LabRecordingView,
} from "@/lib/api";
import { useColors } from "@/design/theme";
import { radius, space } from "@/design/tokens";
import {
  EmptyState,
  Icon,
  type IconName,
  ListSkeleton,
  PressableScale,
  Screen,
  Text,
} from "@/design/ui";
import { shortDateTime } from "@/lib/format";

/** "1:23" / "1:02:05" — compact clock for a recording's duration. */
function formatDuration(totalSec: number | null | undefined): string {
  const s = Math.max(0, Math.floor(typeof totalSec === "number" ? totalSec : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Per-status row affordance: icon glyph, icon tile tone, and a short label. */
const STATUS_UI: Record<
  LabRecordingStatus,
  { icon: IconName; label: string; labelColor: "accentText" | "textSubtle" | "danger" }
> = {
  ready: { icon: "play", label: "Ready", labelColor: "accentText" },
  processing: { icon: "clock", label: "Processing…", labelColor: "textSubtle" },
  failed: { icon: "video-off", label: "Unavailable", labelColor: "danger" },
};

export default function LabRecordingsScreen() {
  const c = useColors();
  const router = useRouter();
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const cid = String(classId || "");

  const [items, setItems] = useState<LabRecordingView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!cid) {
      setError("Missing class.");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const res = await api.labRecordings(cid);
      setItems(res.recordings || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't load recordings.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cid]);

  useEffect(() => {
    load();
  }, [load]);

  const openRecording = (r: LabRecordingView) => {
    // The player handles processing/failed states itself, so every row is
    // tappable; only the signed URL fetch (detail call) happens there.
    router.push({
      pathname: "/lab/replay/[recordingId]",
      params: { recordingId: r.id },
    });
  };

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: "Lab recordings" }} />

      <ScrollView
        style={{ flex: 1, backgroundColor: c.bg }}
        contentContainerStyle={{
          paddingHorizontal: space[4],
          paddingTop: space[5],
          paddingBottom: space[16],
        }}
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
          Replay recorded lab sessions for this class. Tap a recording to watch.
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
            icon="video"
            title="No recordings yet"
            body="When your teacher records a lab session, it shows up here to replay."
          />
        ) : (
          <View style={{ gap: space[2] }}>
            {items.map((r) => (
              <RecordingRow key={r.id} r={r} onPress={() => openRecording(r)} />
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────

function RecordingRow({ r, onPress }: { r: LabRecordingView; onPress: () => void }) {
  const c = useColors();
  const ui = STATUS_UI[r.status] ?? STATUS_UI.processing;
  const isReady = r.status === "ready";
  const title = r.sessionTitle?.trim() || "Lab recording";
  const meta = [
    shortDateTime(r.createdAt),
    r.durationSec ? formatDuration(r.durationSec) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.99}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space[3],
        padding: space[3],
        borderRadius: radius.lg,
        backgroundColor: c.surface,
        borderWidth: 0.5,
        borderColor: c.border,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: radius.md,
          backgroundColor: isReady ? c.accentSubtle : c.surfaceAlt,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={ui.icon} size={18} color={isReady ? "accentText" : "textMuted"} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="subhead" numberOfLines={1}>
          {title}
        </Text>
        {meta ? (
          <Text variant="caption" color="textSubtle" numberOfLines={1} style={{ marginTop: 2 }}>
            {meta}
          </Text>
        ) : null}
      </View>
      <Text variant="caption" color={ui.labelColor} style={{ fontWeight: "600" }}>
        {ui.label}
      </Text>
      <Icon name="chevron-right" size={18} color="textSubtle" />
    </PressableScale>
  );
}
