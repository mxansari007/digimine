/**
 * Lab replay player — `/lab/replay/<recordingId>`.
 *
 * View-only companion screen: fetches one recording's signed playback URL via
 * `api.labRecording(recordingId)` and plays it with the app's existing
 * `expo-video` player (the SAME player the resources screen uses for class
 * videos — §5 of the contract). Registered with `headerShown:false` in
 * `_layout.tsx`, so this screen paints its OWN chrome (a back control over a
 * dark video surface), mirroring the `ResourceViewer` full-screen pattern.
 *
 * Recording lifecycle (mirrored from the web `serializeLabRecording`):
 *   - "processing" → no URL yet; show a still-processing state + Refresh that
 *     re-calls the detail route (it re-reconciles + re-signs on each call).
 *   - "ready"      → `recording.url` is a short-lived signed GCS URL; load it
 *     into the player and autoplay. `recording.chapters` render as a tappable
 *     list that seeks the player.
 *   - "failed"     → terminal error state.
 *
 * The signed URL is short-lived, so it is only ever fetched on this detail
 * call (the list call never mints it) and fed straight into the player.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StatusBar, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { api, ApiError, type LabRecordingView } from "@/lib/api";
import { useColors } from "@/design/theme";
import { radius, space } from "@/design/tokens";
import {
  Button,
  Icon,
  PressableScale,
  Skeleton,
  Text,
} from "@/design/ui";
import { shortDateTime } from "@/lib/format";

type Phase = "loading" | "ready" | "processing" | "failed" | "error";

/** "1:23" / "1:02:05" — clamps negatives, used for duration + chapter offsets. */
function formatClock(totalSec: number | null | undefined): string {
  const s = Math.max(0, Math.floor(typeof totalSec === "number" ? totalSec : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export default function LabReplayScreen() {
  const { recordingId } = useLocalSearchParams<{ recordingId: string }>();
  const rid = String(recordingId || "");
  const router = useRouter();
  const c = useColors();

  const [phase, setPhase] = useState<Phase>("loading");
  const [recording, setRecording] = useState<LabRecordingView | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // The player is created once (hooks can't be conditional) with NO source; we
  // hand it the signed URL via `replace()` only once the recording is "ready".
  // `loadedUrlRef` guards against re-loading the same URL on re-render, while
  // still re-loading when a Refresh mints a fresh signed URL.
  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
  });
  const loadedUrlRef = useRef<string | null>(null);

  const fetchRecording = useCallback(async (): Promise<void> => {
    if (!rid) {
      setPhase("error");
      setErrorMsg("Missing recording.");
      return;
    }
    try {
      const { recording: rec } = await api.labRecording(rid);
      if (!rec) {
        setPhase("error");
        setErrorMsg("This recording could not be found.");
        return;
      }
      setRecording(rec);
      if (rec.status === "ready" && rec.url) setPhase("ready");
      else if (rec.status === "failed") setPhase("failed");
      else setPhase("processing"); // "processing", or "ready" with no URL yet
    } catch (e: unknown) {
      const msg =
        e instanceof ApiError
          ? e.body?.error || e.message
          : e instanceof Error
            ? e.message
            : "Couldn't load this recording.";
      setPhase("error");
      setErrorMsg(msg);
    }
  }, [rid]);

  useEffect(() => {
    void fetchRecording();
  }, [fetchRecording]);

  // Load the signed URL into the player the moment we have a ready recording,
  // and autoplay. Re-runs if a Refresh produced a new signed URL.
  useEffect(() => {
    if (phase !== "ready" || !recording?.url) return;
    if (loadedUrlRef.current === recording.url) return;
    loadedUrlRef.current = recording.url;
    try {
      player.replace(recording.url);
      player.play();
    } catch {
      // The native player can throw if released mid-navigation; ignore.
    }
  }, [phase, recording?.url, player]);

  // Pause on unmount so audio never outlives the screen (the hook releases the
  // native player itself, but pausing first avoids a blip on slow teardown).
  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {
        // already released
      }
    };
  }, [player]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    loadedUrlRef.current = null; // force a re-load if a fresh URL comes back
    await fetchRecording();
    setRefreshing(false);
  }, [fetchRecording]);

  const seekTo = useCallback(
    (sec: number) => {
      try {
        player.currentTime = Math.max(0, sec);
        player.play();
      } catch {
        // player not ready / released
      }
    },
    [player]
  );

  const title = recording?.sessionTitle?.trim() || "Lab recording";

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar barStyle="light-content" />

      {/* Self-painted top chrome (headerShown:false) over the dark surface. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space[3],
          paddingTop: space[12],
          paddingHorizontal: space[4],
          paddingBottom: space[3],
        }}
      >
        <PressableScale
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          scaleTo={0.9}
          hitSlop={10}
        >
          <Icon name="chevron-left" size={26} tint="#fff" />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Text variant="subhead" numberOfLines={1} style={{ color: "#fff" }}>
            {title}
          </Text>
          {recording?.createdAt ? (
            <Text variant="caption" numberOfLines={1} style={{ color: "rgba(255,255,255,0.6)" }}>
              {shortDateTime(recording.createdAt)}
              {recording.durationSec ? ` · ${formatClock(recording.durationSec)}` : ""}
            </Text>
          ) : null}
        </View>
      </View>

      {/* 16:9 video stage — always present; what fills it depends on phase. */}
      <View style={{ aspectRatio: 16 / 9, backgroundColor: "#000", justifyContent: "center" }}>
        {phase === "ready" ? (
          <VideoView
            player={player}
            style={{ flex: 1 }}
            nativeControls
            contentFit="contain"
            allowsPictureInPicture
          />
        ) : phase === "loading" ? (
          <Stage>
            <Skeleton height={44} width={44} style={{ borderRadius: radius.full }} />
            <StageText>Loading recording…</StageText>
          </Stage>
        ) : phase === "processing" ? (
          <Stage>
            <Icon name="clock" size={34} tint="rgba(255,255,255,0.85)" />
            <StageText>Still processing</StageText>
            <StageSub>
              This recording is being prepared. It will be ready to watch shortly.
            </StageSub>
            <Button
              label={refreshing ? "Checking…" : "Refresh"}
              leftIcon="refresh-cw"
              variant="secondary"
              size="compact"
              loading={refreshing}
              onPress={refresh}
              style={{ marginTop: space[5] }}
            />
          </Stage>
        ) : phase === "failed" ? (
          <Stage>
            <Icon name="video-off" size={34} tint="rgba(255,255,255,0.85)" />
            <StageText>Recording unavailable</StageText>
            <StageSub>This session's recording failed to process and can't be played.</StageSub>
          </Stage>
        ) : (
          <Stage>
            <Icon name="alert-triangle" size={34} tint="rgba(255,255,255,0.85)" />
            <StageText>Couldn't load</StageText>
            <StageSub>{errorMsg || "Something went wrong loading this recording."}</StageSub>
            <Button
              label="Try again"
              leftIcon="refresh-cw"
              variant="secondary"
              size="compact"
              loading={refreshing}
              onPress={refresh}
              style={{ marginTop: space[5] }}
            />
          </Stage>
        )}
      </View>

      {/* Chapters (and metadata) live on a light sheet below the stage. */}
      <ScrollView
        style={{ flex: 1, backgroundColor: c.bg }}
        contentContainerStyle={{
          paddingHorizontal: space[4],
          paddingTop: space[5],
          paddingBottom: space[16],
        }}
        showsVerticalScrollIndicator={false}
      >
        {phase === "loading" ? (
          <View style={{ gap: space[3] }}>
            <Skeleton height={14} width="40%" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} height={44} />
            ))}
          </View>
        ) : recording && recording.chapters.length > 0 ? (
          <View>
            <Text
              variant="caption"
              color="textSubtle"
              style={{ textTransform: "uppercase", marginBottom: space[3] }}
            >
              Chapters
            </Text>
            <View style={{ gap: space[2] }}>
              {recording.chapters.map((ch, i) => (
                <ChapterRow
                  key={`${ch.tsSec}-${i}`}
                  index={i + 1}
                  title={ch.title}
                  ts={formatClock(ch.tsSec)}
                  disabled={phase !== "ready"}
                  onPress={() => seekTo(ch.tsSec)}
                />
              ))}
            </View>
            {phase !== "ready" ? (
              <Text variant="caption" color="textSubtle" style={{ marginTop: space[3] }}>
                Chapters become tappable once the recording is ready.
              </Text>
            ) : null}
          </View>
        ) : recording ? (
          <Text variant="footnote" color="textMuted">
            {phase === "ready"
              ? "No chapters for this recording. Use the player controls to scrub."
              : "Recording details will appear once it's ready."}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

// ── Stage helpers (centered content over the dark video area) ────────────────

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: space[8],
        gap: space[2],
      }}
    >
      {children}
    </View>
  );
}

function StageText({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="subhead" align="center" style={{ color: "#fff", marginTop: space[2] }}>
      {children}
    </Text>
  );
}

function StageSub({ children }: { children: React.ReactNode }) {
  return (
    <Text
      variant="footnote"
      align="center"
      style={{ color: "rgba(255,255,255,0.6)", maxWidth: 300 }}
    >
      {children}
    </Text>
  );
}

// ── Chapter row ──────────────────────────────────────────────────────────────

function ChapterRow({
  index,
  title,
  ts,
  disabled,
  onPress,
}: {
  index: number;
  title: string;
  ts: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <PressableScale
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
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
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: radius.md,
          backgroundColor: c.accentSubtle,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="play" size={16} color="accentText" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="subhead" numberOfLines={1}>
          {title || `Chapter ${index}`}
        </Text>
        <Text variant="caption" color="textSubtle">
          {ts}
        </Text>
      </View>
      <Icon name="chevron-right" size={18} color="textSubtle" />
    </PressableScale>
  );
}
