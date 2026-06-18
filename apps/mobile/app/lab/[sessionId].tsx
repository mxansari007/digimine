/**
 * Live Lab room — the VIEW-ONLY mobile companion to the web Virtual Lab.
 *
 * What it does (and deliberately does NOT do):
 *   • Mints a LiveKit token via POST /api/lab/token (api.getLabToken) and joins
 *     the session's room with the { url, token } pair the server returns — that
 *     pair is the single source of truth for the SFU URL (no env var).
 *   • Renders a live PARTICIPANT MAP from each LiveKit participant's identity +
 *     `metadata` (name, role, status), updating on connect / disconnect /
 *     metadata-change.
 *   • WATCHES the teacher's broadcast: subscribes to + renders the teacher's
 *     video track (screen-share if present, else camera) via <VideoTrack/>, with
 *     a graceful "waiting for the teacher" empty state.
 *   • RAISE HAND: a raised/lowered toggle that (1) pulses the LiveKit data
 *     channel (publishData), (2) POSTs the durable mirror to /api/lab/events
 *     (api.raiseHand), and (3) reflects `handRaisedAt` on our own participant
 *     metadata so a late-joining teacher sees it.
 *
 *   It NEVER publishes a track (view-only): no camera, no screen share, no peer
 *   share, no remote control. The server grant may allow publishing; mobile must
 *   not use it.
 *
 * NATIVE MODULE — @livekit/react-native(+ -webrtc) is a native module: it does
 * NOT run in Expo Go and CANNOT be validated in this environment. Requires a dev
 * build (`npx expo prebuild --clean && npx expo run:android`). registerGlobals()
 * is called once at app startup in app/_layout.tsx (Builder A); it is also called
 * here defensively (idempotent) so the screen is robust if loaded in isolation.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
// RN-specific pieces come from @livekit/react-native; the core room/track classes
// come from livekit-client (the RN SDK does NOT re-export them — see the SDK's own
// docs, which import `Track` from "livekit-client"). The TrackReference type that
// <VideoTrack/> expects is from @livekit/components-react (a dep of the RN SDK).
import { AudioSession, VideoTrack, registerGlobals } from "@livekit/react-native";
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  RemoteTrackPublication,
  type Participant,
} from "livekit-client";
import type { TrackReference } from "@livekit/components-react";
import * as Haptics from "expo-haptics";
import { api, ApiError, type LabRole, type LabStatus } from "@/lib/api";
import { useColors } from "@/design/theme";
import { radius, space } from "@/design/tokens";
import { Button, Icon, type IconName, PressableScale, Text } from "@/design/ui";
import { LivePill } from "@/design/bold";

// registerGlobals wires the WebRTC globals; it MUST run before any Room connects.
// Builder A calls it once at app startup (app/_layout.tsx); this defensive call is
// idempotent so the screen is robust if it's ever the first LiveKit code loaded.
registerGlobals();

// ── Wire protocol (kept byte-compatible with apps/web labProtocol.ts) ────────
// Inlined so the room screen is self-contained; ported only what the view-only
// companion needs: the participant-metadata presence row + a hand-raise packet.

/** The per-avatar presence row stored on `participant.metadata` (web-compatible). */
interface LabParticipantMeta {
  seat: number;
  status: LabStatus;
  sharingTo: string[];
  handRaisedAt: number | null;
  spotlightUid?: string | null;
}

const LAB_STATUSES: readonly LabStatus[] = ["on_task", "idle", "needs_help", "sharing", "watching"];
function isLabStatus(v: unknown): v is LabStatus {
  return typeof v === "string" && (LAB_STATUSES as readonly string[]).includes(v);
}

/** Tolerant parse of a participant's metadata JSON → LabParticipantMeta. */
function parseParticipantMeta(raw: string | undefined | null, fallbackSeat = 0): LabParticipantMeta {
  const fallback: LabParticipantMeta = {
    seat: fallbackSeat,
    status: "on_task",
    sharingTo: [],
    handRaisedAt: null,
    spotlightUid: null,
  };
  if (!raw) return fallback;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (!obj || typeof obj !== "object") return fallback;
  const o = obj as Record<string, unknown>;
  return {
    seat: typeof o.seat === "number" ? o.seat : fallbackSeat,
    status: isLabStatus(o.status) ? o.status : "on_task",
    sharingTo: Array.isArray(o.sharingTo) ? o.sharingTo.filter((x): x is string => typeof x === "string") : [],
    handRaisedAt: typeof o.handRaisedAt === "number" ? o.handRaisedAt : null,
    spotlightUid: typeof o.spotlightUid === "string" ? o.spotlightUid : null,
  };
}

/** Encode a hand raise/lower as the `{ t:"hand", raised }` packet the web reacts to. */
function encodeHand(raised: boolean): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ t: "hand", raised }));
}

// ── Local view model for the participant map ─────────────────────────────────

type MapRow = {
  uid: string;
  name: string;
  role: LabRole;
  status: LabStatus;
  handRaised: boolean;
  isYou: boolean;
  isTeacher: boolean;
};

// status → { label, dot colour token, icon }. Mirrors the web LabMap legend.
const STATUS_META: Record<
  LabStatus,
  { label: string; tone: "success" | "warning" | "danger" | "accent" | "muted"; icon: IconName }
> = {
  on_task: { label: "On task", tone: "success", icon: "check-circle" },
  watching: { label: "Watching", tone: "accent", icon: "eye" },
  sharing: { label: "Sharing", tone: "accent", icon: "monitor" },
  idle: { label: "Idle", tone: "muted", icon: "moon" },
  needs_help: { label: "Needs help", tone: "danger", icon: "help-circle" },
};

/** Read the role baked into a participant's token metadata ({ sessionId, role }). */
function roleFromParticipant(p: Participant): LabRole {
  try {
    if (p.metadata) {
      const meta = JSON.parse(p.metadata) as { role?: unknown };
      if (meta.role === "teacher" || meta.role === "student" || meta.role === "observer") {
        return meta.role;
      }
    }
  } catch {
    /* fall through */
  }
  return "student";
}

/**
 * The teacher's screen-share OR camera publication. Prefer the screen share
 * (that's the broadcast the class watches); fall back to the camera. Resolves by
 * source first, then by the web's named publications so we still find the share
 * the instant it's announced.
 */
function teacherVideoPub(p: Participant): RemoteTrackPublication | undefined {
  const byScreen =
    p.getTrackPublication(Track.Source.ScreenShare) ??
    p.getTrackPublicationByName("lab-broadcast") ??
    p.getTrackPublicationByName("lab-share");
  if (byScreen instanceof RemoteTrackPublication) return byScreen;
  const byCam = p.getTrackPublication(Track.Source.Camera);
  return byCam instanceof RemoteTrackPublication ? byCam : undefined;
}

type Phase = "connecting" | "live" | "reconnecting" | "error" | "ended";

export default function LabRoomScreen() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ sessionId: string; title?: string }>();
  const sessionId = String(params.sessionId || "");

  // The live Room lives in a ref so re-renders never recreate it; React state is
  // the *derived* snapshot the UI paints.
  const roomRef = useRef<Room | null>(null);
  // A full mirror of OUR OWN metadata so a partial update (hand) doesn't clobber
  // the rest of the blob when we setMetadata. (Our identity comes straight off
  // room.localParticipant; no separate ref needed.)
  const myMetaRef = useRef<LabParticipantMeta>({
    seat: 0,
    status: "on_task",
    sharingTo: [],
    handRaisedAt: null,
    spotlightUid: null,
  });

  const [phase, setPhase] = useState<Phase>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<MapRow[]>([]);
  const [teacherTrack, setTeacherTrack] = useState<TrackReference | null>(null);
  const [handRaised, setHandRaised] = useState(false);
  const [handBusy, setHandBusy] = useState(false);

  // Title is passed by the caller (the class screen's "Join live lab" CTA) so we
  // don't need a classId here; fall back to a generic label.
  const title = typeof params.title === "string" && params.title ? params.title : "Live lab";

  // ── Derive the map + teacher track from the live room (called on every event)
  // Teacher resolution mirrors the web hook: the teacher is whoever carries
  // role:"teacher" in their SERVER-MINTED token metadata (never client-trusted).
  const recompute = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const me = room.localParticipant;
    const myUid = me.identity;

    // Keep our own metadata mirror in lock-step with the wire.
    myMetaRef.current = parseParticipantMeta(me.metadata, myMetaRef.current.seat);
    setHandRaised(myMetaRef.current.handRaisedAt != null);

    const all: Participant[] = [me, ...room.remoteParticipants.values()];

    const next: MapRow[] = all.map((p, i) => {
      const role = roleFromParticipant(p);
      const isTeacher = role === "teacher";
      const meta = parseParticipantMeta(p.metadata, isTeacher ? 0 : i);
      return {
        uid: p.identity,
        name: p.name || (isTeacher ? "Teacher" : "Student"),
        role,
        status: meta.status,
        handRaised: meta.handRaisedAt != null,
        isYou: p.identity === myUid,
        isTeacher,
      };
    });
    // Teacher first, then hands-up, then by name — a stable, readable ordering.
    next.sort((a, b) => {
      if (a.isTeacher !== b.isTeacher) return a.isTeacher ? -1 : 1;
      if (a.handRaised !== b.handRaised) return a.handRaised ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    setRows(next);

    // Teacher broadcast: find the teacher participant, resolve their screen/cam
    // publication, ensure we're subscribed (view-only auto-subscribe should have
    // it, but make it explicit + robust for a late joiner), and build a
    // TrackReference for <VideoTrack/>. Null when the teacher hasn't published.
    const teacher = all.find((p) => roleFromParticipant(p) === "teacher");
    let track: TrackReference | null = null;
    if (teacher && teacher.identity !== myUid) {
      const pub = teacherVideoPub(teacher);
      if (pub) {
        if (!pub.isSubscribed) {
          try {
            pub.setSubscribed(true);
          } catch {
            /* best-effort */
          }
        }
        if (pub.isSubscribed && pub.track) {
          track = { participant: teacher, source: pub.source, publication: pub } as TrackReference;
        }
      }
    }
    setTeacherTrack(track);
  }, []);

  // ── Connect / teardown ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) {
      setPhase("error");
      setError("Missing session.");
      return;
    }
    let cancelled = false;
    const room = new Room({
      adaptiveStream: true, // auto-manage subscribed video quality
      dynacast: true,
    });
    roomRef.current = room;

    const onChange = () => {
      if (!cancelled) recompute();
    };
    const onConnState = (s: ConnectionState) => {
      if (cancelled) return;
      if (s === ConnectionState.Reconnecting) setPhase("reconnecting");
      else if (s === ConnectionState.Connected) setPhase("live");
    };
    const onDisconnected = () => {
      if (!cancelled) setPhase("ended");
    };

    room
      .on(RoomEvent.ParticipantConnected, onChange)
      .on(RoomEvent.ParticipantDisconnected, onChange)
      .on(RoomEvent.ParticipantMetadataChanged, onChange)
      .on(RoomEvent.TrackSubscribed, onChange)
      .on(RoomEvent.TrackUnsubscribed, onChange)
      .on(RoomEvent.TrackPublished, onChange)
      .on(RoomEvent.TrackUnpublished, onChange)
      .on(RoomEvent.LocalTrackPublished, onChange)
      .on(RoomEvent.ConnectionStateChanged, onConnState)
      .on(RoomEvent.Disconnected, onDisconnected);

    (async () => {
      try {
        // Audio session must be started before connecting (RN SDK requirement),
        // so the teacher's audio plays even though we publish nothing ourselves.
        await AudioSession.startAudioSession();

        // Mint the token (server re-resolves role + 409s if not live).
        const tok = await api.getLabToken(sessionId);
        if (cancelled) return;

        // Connect with the SERVER-RETURNED url+token pair (same room, same SFU).
        // Do NOT auto-publish anything — this is a view-only companion.
        await room.connect(tok.url, tok.token, { autoSubscribe: true });
        if (cancelled) return;
        setPhase("live");
        recompute();
      } catch (e: any) {
        if (cancelled) return;
        const msg =
          e instanceof ApiError
            ? e.body?.error || e.message
            : e?.message || "Couldn't join this lab.";
        setError(msg);
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
      room
        .off(RoomEvent.ParticipantConnected, onChange)
        .off(RoomEvent.ParticipantDisconnected, onChange)
        .off(RoomEvent.ParticipantMetadataChanged, onChange)
        .off(RoomEvent.TrackSubscribed, onChange)
        .off(RoomEvent.TrackUnsubscribed, onChange)
        .off(RoomEvent.TrackPublished, onChange)
        .off(RoomEvent.TrackUnpublished, onChange)
        .off(RoomEvent.LocalTrackPublished, onChange)
        .off(RoomEvent.ConnectionStateChanged, onConnState)
        .off(RoomEvent.Disconnected, onDisconnected);
      room.disconnect();
      roomRef.current = null;
      AudioSession.stopAudioSession().catch(() => {});
    };
  }, [sessionId, recompute]);

  // ── Raise hand (dual-write: data channel + durable event + own metadata) ────
  const toggleHand = useCallback(async () => {
    const room = roomRef.current;
    if (!room || handBusy || phase !== "live") return;
    const next = !handRaised;
    setHandBusy(true);
    setHandRaised(next); // optimistic
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    // (1) low-latency nudge over the LiveKit data channel.
    try {
      await room.localParticipant.publishData(encodeHand(next), { reliable: true });
    } catch {
      /* the durable mirror below + metadata still carry it */
    }

    // (3) reflect handRaisedAt on our own participant metadata so a late-joining
    // teacher (and every other client) sees it on read. Merge into the full blob.
    const merged: LabParticipantMeta = {
      ...myMetaRef.current,
      handRaisedAt: next ? Date.now() : null,
    };
    myMetaRef.current = merged;
    try {
      await room.localParticipant.setMetadata(JSON.stringify(merged));
    } catch {
      /* best-effort */
    }

    // (2) durable mirror → /api/lab/events (server stamps actorUid).
    try {
      await api.raiseHand(sessionId, next);
    } catch {
      /* best-effort; the live signal already went out */
    } finally {
      setHandBusy(false);
    }
  }, [handBusy, handRaised, phase, sessionId]);

  const teacherRow = useMemo(() => rows.find((r) => r.isTeacher) ?? null, [rows]);
  const handsUp = useMemo(() => rows.filter((r) => r.handRaised && !r.isTeacher).length, [rows]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: "#000", paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top bar: back, title, live/reconnecting pill */}
      <View style={styles.topBar}>
        <PressableScale onPress={() => router.back()} scaleTo={0.9} hitSlop={10}>
          <Icon name="chevron-left" size={26} tint="#fff" />
        </PressableScale>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="subhead" numberOfLines={1} style={{ color: "#fff" }}>
            {title}
          </Text>
          <Text variant="caption" numberOfLines={1} style={{ color: "rgba(255,255,255,0.6)" }}>
            {rows.length} {rows.length === 1 ? "person" : "people"} here
            {handsUp > 0 ? ` · ${handsUp} hand${handsUp === 1 ? "" : "s"} up` : ""}
          </Text>
        </View>
        {phase === "live" ? (
          <LivePill />
        ) : phase === "reconnecting" ? (
          <LivePill label="RECONNECTING" />
        ) : null}
      </View>

      {/* Stage: the teacher broadcast (or its empty/loading state) */}
      <View style={styles.stage}>
        {phase === "connecting" ? (
          <StageMessage
            spinner
            title="Joining the lab…"
            body="Connecting you to the live session."
          />
        ) : phase === "error" ? (
          <StageMessage
            icon="alert-triangle"
            title="Couldn't join"
            body={error || "This lab couldn't be opened right now."}
            action={<Button label="Back to class" variant="secondary" onPress={() => router.back()} />}
          />
        ) : phase === "ended" ? (
          <StageMessage
            icon="check-circle"
            title="You left the lab"
            body="The live session ended or you disconnected."
            action={<Button label="Back to class" variant="secondary" onPress={() => router.back()} />}
          />
        ) : teacherTrack ? (
          <VideoTrack
            trackRef={teacherTrack}
            style={StyleSheet.absoluteFill}
            objectFit="contain"
          />
        ) : (
          <StageMessage
            icon="video-off"
            title={teacherRow ? "Waiting for the teacher to go live" : "Waiting for the teacher"}
            body={
              teacherRow
                ? `${teacherRow.name} is in the room. Their screen will appear here when they start broadcasting.`
                : "The teacher hasn't joined yet. The broadcast will appear here once they do."
            }
            spinner
          />
        )}

        {/* Recording / reconnecting overlay hints sit on top of the stage. */}
        {phase === "reconnecting" ? (
          <View style={styles.reconnectChip}>
            <ActivityIndicator color="#fff" size="small" />
            <Text variant="caption" style={{ color: "#fff" }}>
              Reconnecting…
            </Text>
          </View>
        ) : null}
      </View>

      {/* Participant map (horizontal strip of avatars + status) */}
      {phase === "live" || phase === "reconnecting" ? (
        <View style={styles.mapWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: space[4], gap: space[3] }}
          >
            {rows.map((r) => (
              <ParticipantPill key={r.uid} row={r} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Bottom action bar: RAISE HAND toggle (view-only — no publish controls) */}
      <View style={[styles.actionBar, { paddingBottom: insets.bottom + space[3] }]}>
        <PressableScale
          onPress={toggleHand}
          disabled={phase !== "live" || handBusy}
          scaleTo={0.96}
          style={[
            styles.handButton,
            {
              backgroundColor: handRaised ? c.warning : "rgba(255,255,255,0.12)",
              opacity: phase !== "live" || handBusy ? 0.5 : 1,
            },
          ]}
        >
          <Icon name="chevrons-up" size={22} tint="#fff" />
          <Text variant="bodyEm" style={{ color: "#fff" }}>
            {handRaised ? "Lower hand" : "Raise hand"}
          </Text>
        </PressableScale>
        <Text variant="caption" align="center" style={{ color: "rgba(255,255,255,0.45)", marginTop: space[2] }}>
          You're watching. Raise your hand to get the teacher's attention.
        </Text>
      </View>
    </View>
  );
}

// ── Stage empty / loading / error message ────────────────────────────────────

function StageMessage({
  icon,
  title,
  body,
  action,
  spinner,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: React.ReactNode;
  spinner?: boolean;
}) {
  return (
    <View style={styles.stageMessage}>
      {spinner ? (
        <ActivityIndicator color="rgba(255,255,255,0.85)" size="large" />
      ) : icon ? (
        <Icon name={icon} size={40} tint="rgba(255,255,255,0.7)" />
      ) : null}
      <Text variant="title3" align="center" style={{ color: "#fff", marginTop: space[4] }}>
        {title}
      </Text>
      {body ? (
        <Text
          variant="callout"
          align="center"
          style={{ color: "rgba(255,255,255,0.65)", marginTop: space[2], maxWidth: 320 }}
        >
          {body}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: space[6] }}>{action}</View> : null}
    </View>
  );
}

// ── Participant pill (one avatar + name + status dot) ─────────────────────────

function ParticipantPill({ row }: { row: MapRow }) {
  const c = useColors();
  const sm = STATUS_META[row.status] ?? STATUS_META.on_task;
  const dotColor =
    sm.tone === "success"
      ? c.success
      : sm.tone === "warning"
        ? c.warning
        : sm.tone === "danger"
          ? c.danger
          : sm.tone === "accent"
            ? c.accent
            : "rgba(255,255,255,0.4)";
  const letter = (row.name || "?").trim()[0]?.toUpperCase() || "?";
  return (
    <View style={styles.pill}>
      <View
        style={[
          styles.pillAvatar,
          {
            backgroundColor: row.isTeacher ? "rgba(45,212,191,0.22)" : "rgba(255,255,255,0.12)",
            borderColor: row.handRaised ? c.warning : "transparent",
            borderWidth: row.handRaised ? 2 : 0,
          },
        ]}
      >
        <Text
          variant="subhead"
          style={{ color: row.isTeacher ? c.accentMuted : "#fff", fontWeight: "700" }}
        >
          {letter}
        </Text>
        {row.handRaised ? (
          <View style={[styles.handBadge, { backgroundColor: c.warning }]}>
            <Icon name="chevrons-up" size={9} tint="#fff" />
          </View>
        ) : null}
        {/* status dot */}
        <View style={[styles.statusDot, { backgroundColor: dotColor, borderColor: "#000" }]} />
      </View>
      <Text variant="caption" numberOfLines={1} style={{ color: "#fff", maxWidth: 64, marginTop: space[1] }}>
        {row.isYou ? "You" : row.name.split(" ")[0]}
      </Text>
      <Text variant="caption" numberOfLines={1} style={{ color: "rgba(255,255,255,0.5)", maxWidth: 64 }}>
        {row.isTeacher ? "Teacher" : sm.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  stage: {
    flex: 1,
    backgroundColor: "#0A0A0A",
    marginHorizontal: space[3],
    borderRadius: radius.lg,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  stageMessage: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space[6],
  },
  reconnectChip: {
    position: "absolute",
    top: space[3],
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radius.full,
  },
  mapWrap: {
    paddingVertical: space[3],
  },
  pill: { alignItems: "center", width: 64 },
  pillAvatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  handBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  statusDot: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  actionBar: {
    paddingHorizontal: space[4],
    paddingTop: space[3],
  },
  handButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
    height: 52,
    borderRadius: radius.full,
  },
});
