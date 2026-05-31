"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, Badge, useToast } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { useEntitlements } from "@/contexts/EntitlementsContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { CalendarClock } from "lucide-react";
import { TrendLine } from "@/components/teacher/TrendLine";
import { ReadinessRing } from "@/components/interview/ReadinessRing";
import { SkillRadar } from "@/components/interview/SkillRadar";
import { InterviewTypeIcon } from "@/components/interview/InterviewTypeIcon";
import {
    DSA_PATTERNS,
    SQL_PATTERNS,
    BEHAVIOUR_DIMENSIONS,
    INTERVIEW_TYPES,
    interviewTypeMeta,
    type AIInterviewReadiness,
    type AIInterviewSessionSummary,
    type InterviewType,
    type PracticeDifficulty,
} from "@digimine/types";

const COMPANIES = ["amazon", "google", "microsoft", "meta", "apple", "bloomberg", "uber", "adobe"];
const DIFFICULTIES: PracticeDifficulty[] = ["easy", "medium", "hard"];
const TECH_TOPICS = ["OOP", "DBMS / SQL", "Operating Systems", "Computer Networks", "Mixed CS fundamentals"];
const DESIGN_TOPICS = ["URL shortener", "Rate limiter", "Chat / messaging app", "News feed", "Notification system"];

interface OpenSlot {
    slotKey: string;
    startsAt: string;
    remaining: number;
}
interface SlotInfo {
    scheduling: {
        slotMinutes: number;
        slotCapacity: number;
        bookingHorizonHours: number;
        joinGraceMin: number;
        joinWindowMin: number;
    };
    activeSession: AIInterviewSessionSummary | null;
    canStartNow: boolean;
    currentRemaining: number;
    currentSlotEndsAt: string;
    openSlots: OpenSlot[];
}

/** Compact, friendly slot label: "Today 2:30 PM", "Tomorrow 9:00 AM", "Mon 14 Jun, 3:00 PM". */
function formatSlot(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const sameDay = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (sameDay(d, now)) return `Today ${time}`;
    if (sameDay(d, tomorrow)) return `Tomorrow ${time}`;
    return `${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}

function barColor(v: number): string {
    if (v >= 75) return "bg-primary-500";
    if (v >= 50) return "bg-accent-500";
    return "bg-danger-500";
}

export default function InterviewsDashboardPage() {
    const router = useRouter();
    const toast = useToast();
    const { firebaseUser, loading: authLoading } = useAuthContext();
    const { hasFeature, ready: entReady } = useEntitlements();
    const canInterview = hasFeature("ai_interview");

    const [loading, setLoading] = useState(true);
    const [sessions, setSessions] = useState<AIInterviewSessionSummary[]>([]);
    const [readiness, setReadiness] = useState<AIInterviewReadiness | null>(null);

    const [showConfig, setShowConfig] = useState(false);
    const [interviewType, setInterviewType] = useState<InterviewType>("dsa");
    const [difficulty, setDifficulty] = useState<PracticeDifficulty>("medium");
    const [pattern, setPattern] = useState<string>("");
    const [company, setCompany] = useState<string>("");
    const [topic, setTopic] = useState<string>("");
    const [starting, setStarting] = useState(false);

    // Slot scheduling state — drives the "start now vs book a slot" UI.
    const [slotInfo, setSlotInfo] = useState<SlotInfo | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<string>("");
    const [showSlots, setShowSlots] = useState(false);
    const [scheduling, setScheduling] = useState(false);
    const [cancelling, setCancelling] = useState(false);

    const load = useCallback(async () => {
        if (!firebaseUser) return;
        setLoading(true);
        try {
            const res = await teacherFetch(firebaseUser, "/api/ai-interview/sessions");
            const data = await res.json();
            if (res.ok) {
                setSessions(Array.isArray(data.sessions) ? data.sessions : []);
                setReadiness(data.readiness || null);
            }
        } catch {
            /* fail soft — empty state renders */
        } finally {
            setLoading(false);
        }
    }, [firebaseUser]);

    const loadSlots = useCallback(async () => {
        if (!firebaseUser) return;
        try {
            const res = await teacherFetch(firebaseUser, "/api/ai-interview/slots");
            const data = await res.json();
            if (res.ok) setSlotInfo(data as SlotInfo);
        } catch {
            /* soft — start button falls back to instant POST */
        }
    }, [firebaseUser]);

    useEffect(() => {
        if (!authLoading && firebaseUser) {
            load();
            loadSlots();
        } else if (!authLoading && !firebaseUser) setLoading(false);
    }, [authLoading, firebaseUser, load, loadSlots]);

    /** Shared interview-config payload for both instant start and booking. */
    const configPayload = useCallback(
        () => ({
            interviewType,
            difficulty,
            pattern:
                interviewType === "dsa" || interviewType === "sql" ? pattern || undefined : undefined,
            topic:
                interviewType === "technical" || interviewType === "system_design"
                    ? topic || undefined
                    : undefined,
            company: company || undefined,
        }),
        [interviewType, difficulty, pattern, topic, company]
    );

    async function startInterview() {
        if (!firebaseUser) return;
        setStarting(true);
        try {
            const res = await teacherFetch(firebaseUser, "/api/ai-interview/start", {
                method: "POST",
                body: JSON.stringify(configPayload()),
            });
            const data = await res.json();
            if (!res.ok) {
                // Current window is full (or the global cap is hit) — pivot the
                // user to booking a future slot instead of a dead-end error.
                if (data.code === "slot_full" || data.code === "capacity_full") {
                    await loadSlots();
                    setShowSlots(true);
                    if (data.nextSlot?.slotKey) setSelectedSlot(data.nextSlot.slotKey);
                    toast.info(
                        "All interview slots are busy right now — reserve the next available time below."
                    );
                    return;
                }
                toast.error(data.error || "Couldn't start the interview", {
                    action:
                        data.code === "premium_required" || data.code === "quota_exceeded"
                            ? { label: "Upgrade", onClick: () => router.push("/membership") }
                            : undefined,
                });
                // Reflect any concurrency block (e.g. an interview already live).
                if (data.code === "interview_in_progress" || data.code === "interview_scheduled") {
                    await loadSlots();
                }
                return;
            }
            router.push(`/dashboard/interviews/${data.session.id}`);
        } catch {
            toast.error("Couldn't start the interview. Please try again.");
        } finally {
            setStarting(false);
        }
    }

    async function scheduleInterview() {
        if (!firebaseUser || !selectedSlot) return;
        setScheduling(true);
        try {
            const res = await teacherFetch(firebaseUser, "/api/ai-interview/schedule", {
                method: "POST",
                body: JSON.stringify({ ...configPayload(), slotKey: selectedSlot }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || "Couldn't book that slot", {
                    action:
                        data.code === "premium_required" || data.code === "quota_exceeded"
                            ? { label: "Upgrade", onClick: () => router.push("/membership") }
                            : undefined,
                });
                await loadSlots();
                return;
            }
            toast.success("Interview booked — we'll hold your slot.");
            setShowConfig(false);
            setShowSlots(false);
            setSelectedSlot("");
            await Promise.all([load(), loadSlots()]);
        } catch {
            toast.error("Couldn't book that slot. Please try again.");
        } finally {
            setScheduling(false);
        }
    }

    async function cancelScheduled(id: string) {
        if (!firebaseUser) return;
        setCancelling(true);
        try {
            const res = await teacherFetch(firebaseUser, "/api/ai-interview/cancel", {
                method: "POST",
                body: JSON.stringify({ sessionId: id }),
            });
            if (res.ok) {
                toast.success("Booking cancelled — your weekly credit is back.");
                await Promise.all([load(), loadSlots()]);
            } else {
                const d = await res.json().catch(() => ({}));
                toast.error(d.error || "Couldn't cancel the booking.");
                await loadSlots();
            }
        } catch {
            toast.error("Couldn't cancel the booking.");
        } finally {
            setCancelling(false);
        }
    }

    // ── Loading ──
    if (authLoading || loading || !entReady) {
        return (
            <div className="flex items-center justify-center py-32">
                <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-200 border-t-primary-600" />
            </div>
        );
    }

    // ── Feature gate — only shown to plans that don't include AI interviews.
    // The free plan grants a small weekly taste, so most signed-in users pass
    // this and land on the dashboard below.
    if (!canInterview) {
        return (
            <div className="space-y-8">
                <div>
                    <h1 className="text-4xl font-bold">AI Mock Interviews</h1>
                    <p className="mt-2 text-slate-500">
                        Practise real coding interviews with an AI interviewer — and track your readiness over time.
                    </p>
                </div>
                <Card intent="primary" padding="xl" elevated className="text-center">
                    <p className="section-eyebrow">Premium</p>
                    <h2 className="text-2xl font-bold mt-2">Unlock AI Mock Interviews</h2>
                    <p className="mt-3 text-slate-600 max-w-xl mx-auto">
                        A grounded AI interviewer asks you a real DSA problem, listens to your approach,
                        drops hints when you&apos;re stuck, runs your code, and grades both correctness and how
                        you communicated — with a behaviour scorecard that tracks your improvement.
                    </p>
                    <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-slate-600 max-w-2xl mx-auto">
                        {["Live AI interviewer", "Real code execution", "Behaviour scorecard", "Readiness trend"].map((f) => (
                            <div key={f} className="surface-panel py-3 px-2">{f}</div>
                        ))}
                    </div>
                    <Link href="/membership">
                        <Button variant="primary" size="lg" className="mt-6">Upgrade to Premium</Button>
                    </Link>
                </Card>
            </div>
        );
    }

    const history = (readiness?.history || []).map((h, i) => ({
        label: `#${i + 1}`,
        value: h.readiness,
    }));

    // ── Derived scheduling state ──
    const active = slotInfo?.activeSession ?? null;
    const grace = slotInfo?.scheduling.joinGraceMin ?? 5;
    // A booked interview can be joined once we're within the grace window of
    // its start time; before that the Join button stays disabled.
    const canJoinScheduled =
        !!active &&
        active.status === "scheduled" &&
        !!active.scheduledAt &&
        Date.now() >= new Date(active.scheduledAt).getTime() - grace * 60_000;
    const openSlots = slotInfo?.openSlots ?? [];
    // History = completed + anything still live or left incomplete; hide the
    // booking-lifecycle states (scheduled is in the banner; cancelled/expired
    // are just freed reservations).
    const pastSessions = sessions.filter(
        (s) => s.status === "completed" || s.status === "in_progress" || s.status === "abandoned"
    );

    // ── Premium dashboard ──
    return (
        <div className="space-y-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-bold">AI Mock Interviews</h1>
                    <p className="mt-2 text-slate-500">Practise, get a scorecard, and watch your readiness climb.</p>
                </div>
                {!active && (
                    <Button variant="primary" size="lg" onClick={() => setShowConfig((s) => !s)}>
                        {showConfig ? "Close" : "Start interview"}
                    </Button>
                )}
            </div>

            {/* One active interview at a time — show its status + the next action
                instead of letting the student queue up a second one. */}
            {active && (
                <Card padding="lg" elevated intent={active.status === "in_progress" ? "primary" : "accent"}>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <Badge variant={active.status === "in_progress" ? "success" : "accent"} size="sm">
                                    {active.status === "in_progress" ? "In progress" : "Scheduled"}
                                </Badge>
                                <span className="text-sm font-semibold text-slate-900">
                                    {interviewTypeMeta(active.interviewType).label}
                                </span>
                            </div>
                            <p className="mt-1 text-sm text-slate-600">
                                {active.status === "in_progress"
                                    ? "You have an interview in progress. Jump back in to finish it."
                                    : active.scheduledAt
                                        ? `Booked for ${formatSlot(active.scheduledAt)}. You can join a few minutes before it starts.`
                                        : "You have an interview booked."}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {active.status === "in_progress" ? (
                                <Button
                                    variant="primary"
                                    onClick={() => router.push(`/dashboard/interviews/${active.id}`)}
                                >
                                    Resume interview
                                </Button>
                            ) : (
                                <>
                                    <Button
                                        variant="secondary"
                                        isLoading={cancelling}
                                        onClick={() => cancelScheduled(active.id)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        variant="primary"
                                        disabled={!canJoinScheduled}
                                        title={canJoinScheduled ? undefined : "You can join a few minutes before the start time"}
                                        onClick={() => router.push(`/dashboard/interviews/${active.id}`)}
                                    >
                                        {canJoinScheduled ? "Join now" : "Join at start time"}
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </Card>
            )}

            {!active && showConfig && (
                <Card padding="lg" elevated>
                    <h2 className="text-lg font-bold mb-1">Choose your interview</h2>
                    <p className="text-sm text-slate-500 mb-4">Pick a round — each runs like a real video interview.</p>

                    {/* Interview type picker */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {INTERVIEW_TYPES.map((t) => {
                            const active = interviewType === t.key;
                            return (
                                <button
                                    key={t.key}
                                    type="button"
                                    onClick={() => {
                                        setInterviewType(t.key);
                                        // A pattern/topic/difficulty from a previous type doesn't
                                        // apply to the new one — reset so we never send a stale
                                        // filter (and behavioral, which hides difficulty, can't
                                        // carry a hidden value forward).
                                        setPattern("");
                                        setTopic("");
                                        setDifficulty("medium");
                                    }}
                                    className={`rounded-xl border p-3 text-left transition-all duration-200 active:scale-[0.98] ${
                                        active
                                            ? "border-primary-500 bg-primary-50 ring-1 ring-primary-200 shadow-soft-sm"
                                            : "border-slate-200 hover:border-primary-300 hover:bg-primary-50/40 hover:shadow-soft-sm"
                                    }`}
                                >
                                    <span
                                        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                                            active ? "bg-primary-100 text-primary-700" : "bg-slate-100 text-slate-500"
                                        }`}
                                    >
                                        <InterviewTypeIcon type={t.key} className="h-5 w-5" />
                                    </span>
                                    <div className="mt-2 text-sm font-semibold text-slate-800">{t.label}</div>
                                    <div className="mt-0.5 text-xs text-slate-500">{t.blurb}</div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Type-specific options */}
                    <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                        {interviewType !== "behavioral" && (
                            <label className="block">
                                <span className="text-sm font-medium text-slate-700">Difficulty</span>
                                <select
                                    className="field-input mt-1 w-full"
                                    value={difficulty}
                                    onChange={(e) => setDifficulty(e.target.value as PracticeDifficulty)}
                                >
                                    {DIFFICULTIES.map((d) => (
                                        <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>
                                    ))}
                                </select>
                            </label>
                        )}

                        {interviewType === "dsa" && (
                            <label className="block">
                                <span className="text-sm font-medium text-slate-700">Pattern (optional)</span>
                                <select
                                    className="field-input mt-1 w-full"
                                    value={pattern}
                                    onChange={(e) => setPattern(e.target.value)}
                                >
                                    <option value="">Any pattern</option>
                                    {DSA_PATTERNS.map((p) => (
                                        <option key={p.id} value={p.id}>{p.label}</option>
                                    ))}
                                </select>
                            </label>
                        )}

                        {interviewType === "sql" && (
                            <label className="block">
                                <span className="text-sm font-medium text-slate-700">SQL skill (optional)</span>
                                <select
                                    className="field-input mt-1 w-full"
                                    value={pattern}
                                    onChange={(e) => setPattern(e.target.value)}
                                >
                                    <option value="">Any SQL skill</option>
                                    {SQL_PATTERNS.map((p) => (
                                        <option key={p.id} value={p.id}>{p.label}</option>
                                    ))}
                                </select>
                            </label>
                        )}

                        {interviewType === "technical" && (
                            <label className="block">
                                <span className="text-sm font-medium text-slate-700">Focus area (optional)</span>
                                <select
                                    className="field-input mt-1 w-full"
                                    value={topic}
                                    onChange={(e) => setTopic(e.target.value)}
                                >
                                    <option value="">Mixed CS fundamentals</option>
                                    {TECH_TOPICS.map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </label>
                        )}

                        {interviewType === "system_design" && (
                            <label className="block">
                                <span className="text-sm font-medium text-slate-700">Design prompt (optional)</span>
                                <select
                                    className="field-input mt-1 w-full"
                                    value={topic}
                                    onChange={(e) => setTopic(e.target.value)}
                                >
                                    <option value="">Pick one for me</option>
                                    {DESIGN_TOPICS.map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </label>
                        )}

                        <label className="block">
                            <span className="text-sm font-medium text-slate-700">Company (optional)</span>
                            <select
                                className="field-input mt-1 w-full"
                                value={company}
                                onChange={(e) => setCompany(e.target.value)}
                            >
                                <option value="">Any company</option>
                                {COMPANIES.map((c) => (
                                    <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
                                ))}
                            </select>
                        </label>
                    </div>

                    {/* ── Adaptive start: instant when the current window has room,
                        otherwise reserve a future slot to protect capacity. ── */}
                    <div className="mt-6 border-t border-slate-100 pt-5">
                        {slotInfo && !slotInfo.canStartNow && (
                            <p className="mb-3 inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
                                <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
                                All interview slots are busy right now. Reserve the next available time below.
                            </p>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs text-slate-500">
                                {slotInfo?.canStartNow
                                    ? `${slotInfo.currentRemaining} of ${slotInfo.scheduling.slotCapacity} live spots open right now.`
                                    : "Pick a time and we'll hold a spot for you."}
                            </div>
                            <div className="flex items-center gap-2">
                                {slotInfo?.canStartNow && (
                                    <Button variant="primary" size="md" isLoading={starting} onClick={startInterview}>
                                        Start now
                                    </Button>
                                )}
                                <Button
                                    variant={slotInfo?.canStartNow ? "secondary" : "primary"}
                                    size="md"
                                    onClick={() => setShowSlots((s) => !s)}
                                >
                                    {showSlots ? "Hide times" : "Schedule for later"}
                                </Button>
                            </div>
                        </div>

                        {showSlots && (
                            <div className="mt-4">
                                {openSlots.length === 0 ? (
                                    <p className="text-sm text-slate-500">
                                        No open slots in the next{" "}
                                        {Math.round((slotInfo?.scheduling.bookingHorizonHours ?? 72) / 24)} days. Try
                                        again shortly.
                                    </p>
                                ) : (
                                    <>
                                        <div className="flex flex-wrap gap-2">
                                            {openSlots.map((s) => {
                                                const sel = selectedSlot === s.slotKey;
                                                return (
                                                    <button
                                                        key={s.slotKey}
                                                        type="button"
                                                        onClick={() => setSelectedSlot(s.slotKey)}
                                                        className={`rounded-xl border px-3 py-2 text-sm font-medium transition-all duration-200 active:scale-95 ${
                                                            sel
                                                                ? "border-primary-500 bg-primary-50 text-primary-800 ring-1 ring-primary-200"
                                                                : "border-slate-200 text-slate-700 hover:border-primary-300 hover:bg-primary-50/50"
                                                        }`}
                                                    >
                                                        {formatSlot(s.startsAt)}
                                                        <span className="ml-1.5 text-[10px] text-slate-400">
                                                            {s.remaining} left
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <div className="mt-4 flex justify-end">
                                            <Button
                                                variant="primary"
                                                size="md"
                                                isLoading={scheduling}
                                                disabled={!selectedSlot}
                                                onClick={scheduleInterview}
                                            >
                                                Book slot
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </Card>
            )}

            {/* Readiness summary */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card padding="lg" elevated className="flex flex-col items-center justify-center">
                    <ReadinessRing
                        value={readiness?.avgReadiness ?? 0}
                        label="Avg readiness"
                        sublabel={readiness ? `${readiness.completedSessions} interview${readiness.completedSessions === 1 ? "" : "s"}` : "No interviews yet"}
                    />
                </Card>

                <Card padding="lg" elevated className="lg:col-span-2">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-lg font-bold">Readiness trend</h2>
                        {readiness && (
                            <Badge variant={readiness.lastReadiness >= 70 ? "success" : "warning"} size="sm">
                                Last: {readiness.lastReadiness}
                            </Badge>
                        )}
                    </div>
                    <TrendLine points={history} height={180} yMax={100} yLabel="" accent="#0d9488" />
                </Card>
            </div>

            {/* Dimension averages + weak areas */}
            {readiness && readiness.completedSessions > 0 && (() => {
                const rows = [
                    ...BEHAVIOUR_DIMENSIONS.map((d) => ({
                        key: d.key as string,
                        label: d.label,
                        value: Math.round(readiness.dimensionAverages?.[d.key] ?? 0),
                    })),
                    { key: "correctness", label: "Correctness / accuracy", value: Math.round(readiness.correctnessAverage ?? 0) },
                ];
                const weakKeys = readiness.weakDimensions ?? [];
                return (
                    <Card padding="lg">
                        <h2 className="text-lg font-bold mb-4">Your skill profile</h2>
                        <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-2">
                            {/* Radar — the whole profile at a glance */}
                            <div className="order-2 lg:order-1">
                                <SkillRadar axes={rows} weak={weakKeys} />
                            </div>
                            {/* Exact values + focus flags */}
                            <div className="order-1 space-y-3 lg:order-2">
                                {rows.map((row) => {
                                    const weak = weakKeys.includes(row.key);
                                    return (
                                        <div key={row.key}>
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="font-medium text-slate-700">
                                                    {row.label}{" "}
                                                    {weak && (
                                                        <span className="ml-1 rounded-full bg-danger-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-danger-600 ring-1 ring-inset ring-danger-200">
                                                            focus
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="font-bold tabular-nums text-slate-700">{row.value}</span>
                                            </div>
                                            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                                                <div
                                                    className={`h-full rounded-full ${barColor(row.value)} transition-[width] duration-700`}
                                                    style={{ width: `${row.value}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        {weakKeys.length > 0 && (
                            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                                <span className="text-sm text-slate-500">Practise next:</span>
                                <Link href="/practice">
                                    <Button variant="outline" size="sm">Targeted practice →</Button>
                                </Link>
                            </div>
                        )}
                    </Card>
                );
            })()}

            {/* Recent sessions — completed history + anything still live. Booking
                lifecycle states (scheduled/cancelled/expired) are surfaced in the
                banner above, not as history noise here. */}
            <div>
                <h2 className="text-xl font-bold mb-4">Recent interviews</h2>
                {pastSessions.length === 0 ? (
                    <Card padding="lg" elevated className="text-center py-16 border-dashed">
                        <p className="font-semibold">No interviews yet</p>
                        <p className="text-sm text-slate-500 mt-2">Start your first AI mock interview to build your readiness score.</p>
                        {!active && (
                            <Button variant="primary" className="mt-4" onClick={() => setShowConfig(true)}>Start interview</Button>
                        )}
                    </Card>
                ) : (
                    <div className="space-y-3">
                        {pastSessions.map((s) => {
                            const href =
                                s.status === "completed"
                                    ? `/dashboard/interviews/${s.id}/results`
                                    : `/dashboard/interviews/${s.id}`;
                            return (
                                <Link key={s.id} href={href} className="block">
                                    <Card padding="md" hoverable className="flex items-center justify-between">
                                        <div className="min-w-0">
                                            <p className="font-semibold truncate">{s.problemTitle}</p>
                                            <p className="text-xs text-slate-500 capitalize">
                                                {s.primaryPattern
                                                    ? s.primaryPattern.replace(/-/g, " ")
                                                    : interviewTypeMeta(s.interviewType).label}{" "}
                                                · {s.difficulty}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            {s.status === "completed" ? (
                                                <Badge variant={(s.readiness ?? 0) >= 70 ? "success" : "warning"} size="sm">
                                                    {s.readiness ?? 0} ready
                                                </Badge>
                                            ) : s.status === "in_progress" ? (
                                                <Badge variant="info" size="sm">In progress</Badge>
                                            ) : (
                                                <Badge variant="secondary" size="sm">Incomplete</Badge>
                                            )}
                                            <span className="text-slate-400">→</span>
                                        </div>
                                    </Card>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
