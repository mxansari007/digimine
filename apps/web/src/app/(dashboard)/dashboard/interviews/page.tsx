"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, Badge, useToast } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { useEntitlements } from "@/contexts/EntitlementsContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { TrendLine } from "@/components/teacher/TrendLine";
import { ReadinessRing } from "@/components/interview/ReadinessRing";
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

function barColor(v: number): string {
    if (v >= 75) return "bg-primary-500";
    if (v >= 50) return "bg-accent-500";
    return "bg-danger-500";
}

export default function InterviewsDashboardPage() {
    const router = useRouter();
    const toast = useToast();
    const { firebaseUser, loading: authLoading } = useAuthContext();
    const { isPremium, ready: entReady } = useEntitlements();

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

    useEffect(() => {
        if (!authLoading && firebaseUser) load();
        else if (!authLoading && !firebaseUser) setLoading(false);
    }, [authLoading, firebaseUser, load]);

    async function startInterview() {
        if (!firebaseUser) return;
        setStarting(true);
        try {
            const res = await teacherFetch(firebaseUser, "/api/ai-interview/start", {
                method: "POST",
                body: JSON.stringify({
                    interviewType,
                    difficulty,
                    pattern:
                        interviewType === "dsa" || interviewType === "sql"
                            ? pattern || undefined
                            : undefined,
                    topic: interviewType === "technical" || interviewType === "system_design"
                        ? topic || undefined
                        : undefined,
                    company: company || undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || "Couldn't start the interview", {
                    action:
                        data.code === "premium_required" || data.code === "quota_exceeded"
                            ? { label: "Upgrade", onClick: () => router.push("/membership") }
                            : undefined,
                });
                return;
            }
            router.push(`/dashboard/interviews/${data.session.id}`);
        } catch {
            toast.error("Couldn't start the interview. Please try again.");
        } finally {
            setStarting(false);
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

    // ── Premium gate ──
    if (!isPremium) {
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

    // ── Premium dashboard ──
    return (
        <div className="space-y-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-bold">AI Mock Interviews</h1>
                    <p className="mt-2 text-slate-500">Practise, get a scorecard, and watch your readiness climb.</p>
                </div>
                <Button variant="primary" size="lg" onClick={() => setShowConfig((s) => !s)}>
                    {showConfig ? "Close" : "Start interview"}
                </Button>
            </div>

            {showConfig && (
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
                                    className={`rounded-xl border p-3 text-left transition ${
                                        active
                                            ? "border-primary-500 bg-primary-50 ring-1 ring-primary-200"
                                            : "border-slate-200 hover:border-slate-300"
                                    }`}
                                >
                                    <div className="text-xl">{t.emoji}</div>
                                    <div className="mt-1 text-sm font-semibold text-slate-800">{t.label}</div>
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

                    <div className="mt-5 flex justify-end">
                        <Button variant="primary" size="md" isLoading={starting} onClick={startInterview}>
                            Begin {INTERVIEW_TYPES.find((t) => t.key === interviewType)?.label} interview
                        </Button>
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
            {readiness && readiness.completedSessions > 0 && (
                <Card padding="lg">
                    <h2 className="text-lg font-bold mb-4">Your skill profile</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                        {[
                            ...BEHAVIOUR_DIMENSIONS.map((d) => ({
                                key: d.key as string,
                                label: d.label,
                                value: readiness.dimensionAverages?.[d.key] ?? 0,
                            })),
                            {
                                key: "correctness",
                                label: "Correctness / accuracy",
                                value: readiness.correctnessAverage ?? 0,
                            },
                        ].map((row) => {
                            const weak = readiness.weakDimensions?.includes(row.key);
                            return (
                                <div key={row.key}>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="font-medium text-slate-700">
                                            {row.label} {weak && <span className="text-danger-600 text-xs">• focus</span>}
                                        </span>
                                        <span className="text-slate-500">{row.value}</span>
                                    </div>
                                    <div className="mt-1 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                                        <div className={`h-full rounded-full ${barColor(row.value)}`} style={{ width: `${row.value}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {readiness.weakDimensions?.length > 0 && (
                        <div className="mt-5 flex flex-wrap items-center gap-2">
                            <span className="text-sm text-slate-500">Practise next:</span>
                            <Link href="/practice">
                                <Button variant="outline" size="sm">Targeted practice →</Button>
                            </Link>
                        </div>
                    )}
                </Card>
            )}

            {/* Recent sessions */}
            <div>
                <h2 className="text-xl font-bold mb-4">Recent interviews</h2>
                {sessions.length === 0 ? (
                    <Card padding="lg" elevated className="text-center py-16 border-dashed">
                        <p className="font-semibold">No interviews yet</p>
                        <p className="text-sm text-slate-500 mt-2">Start your first AI mock interview to build your readiness score.</p>
                        <Button variant="primary" className="mt-4" onClick={() => setShowConfig(true)}>Start interview</Button>
                    </Card>
                ) : (
                    <div className="space-y-3">
                        {sessions.map((s) => {
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
                                            ) : (
                                                <Badge variant="info" size="sm">In progress</Badge>
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
