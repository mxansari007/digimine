"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, useParams } from "next/navigation";
import { Button, Card, FormattedContent, useToast } from "@digimine/ui";
import Editor from "@monaco-editor/react";
import {
    getTestSeriesBySlug,
    getTestById,
    getTestQuestions,
    hasUserPurchasedTest,
    enrollInFreeTestSeries,
    updateTestAttempt,
    submitTestAttempt,
    getTestAttempt
} from "@/lib/firestore/tests";
import { getContestById } from "@/lib/firestore/contests";
import { useAuthContext } from "@/contexts/AuthContext";
import { useAttemptGate } from "@/hooks/useAttemptGate";
import { FileTextIcon, RefreshIcon } from "@/components/icons/AppIcons";
import type { Contest, TestSeries, Test, TestSection, Question, TestAttempt, CodeLanguage } from "@digimine/types";

const LANGUAGE_MAP: Record<CodeLanguage, string> = {
    python: "python",
    javascript: "javascript",
    cpp: "cpp",
    java: "java",
};

type QuestionStatus =
    | "not_visited"
    | "visited"
    | "answered"
    | "marked_for_review"        // flagged, no answer yet
    | "answered_and_marked"      // flagged AND answered (GATE/UGC convention)
    | "code_unrun";

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

function hashSeed(value: string): number {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function seededRandom(seed: string) {
    let state = hashSeed(seed) || 1;
    return () => {
        state = Math.imul(1664525, state) + 1013904223;
        return ((state >>> 0) / 4294967296);
    };
}

function stableShuffle<T>(items: T[], seed: string): T[] {
    const result = [...items];
    const random = seededRandom(seed);
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function getSortedTestSections(test?: Test | null): TestSection[] {
    return [...(test?.sections || [])]
        .filter((section) => section.title.trim())
        .sort((a, b) => a.order - b.order);
}

function orderQuestionsBySection(questions: Question[], test: Test): Question[] {
    const sections = getSortedTestSections(test);
    if (sections.length === 0) return questions;

    const sectionOrder = new Map(sections.map((section, index) => [section.id, index]));
    const fallbackOrder = sections.length;

    return [...questions].sort((a, b) => {
        const aRank = a.sectionId ? sectionOrder.get(a.sectionId) ?? fallbackOrder : fallbackOrder;
        const bRank = b.sectionId ? sectionOrder.get(b.sectionId) ?? fallbackOrder : fallbackOrder;
        return aRank - bRank || a.order - b.order;
    });
}

function getQuestionScoring(test: Test, question: Question) {
    const section = (test.sections || []).find((item) => item.id === question.sectionId);
    return {
        marks: typeof section?.marksPerQuestion === "number" ? section.marksPerQuestion : question.marks,
        negativeMarks: typeof section?.negativeMarks === "number" ? section.negativeMarks : (question.negativeMarks || 0),
    };
}

function applyTestSettings(questions: Question[], test: Test, attemptId: string): Question[] {
    const sections = getSortedTestSections(test);
    const orderedBySection = orderQuestionsBySection(questions, test);

    // 1. Build "units" — a unit is either a singleton question or a group of
    //    questions sharing the same `passageGroup`. Groups always keep their
    //    members together in their original order.
    type Unit = { key: string; items: Question[]; sectionId: string };
    const units: Unit[] = [];
    const groupIndex = new Map<string, number>();
    orderedBySection.forEach((q) => {
        const group = q.passageGroup?.trim();
        const sectionId = q.sectionId || "";
        if (group) {
            const groupKey = `${sectionId}:${group}`;
            const idx = groupIndex.get(groupKey);
            if (idx === undefined) {
                groupIndex.set(groupKey, units.length);
                units.push({ key: `group:${group}`, items: [q], sectionId });
            } else {
                units[idx].items.push(q);
            }
        } else {
            units.push({ key: `q:${q.id}`, items: [q], sectionId });
        }
    });

    // 2. Shuffle the units (not individual grouped questions) when requested.
    // For sectioned tests, section order stays stable and questions shuffle only
    // within their own section.
    const orderedUnits = (() => {
        if (!test.shuffleQuestions) return units;
        if (sections.length === 0) return stableShuffle(units, `${attemptId}:questions`);

        const buckets = new Map<string, Unit[]>();
        units.forEach((unit) => {
            const key = unit.sectionId || "";
            buckets.set(key, [...(buckets.get(key) || []), unit]);
        });

        const sectionIds = sections.map((section) => section.id);
        const orderedSectionIds = [
            ...sectionIds,
            "",
            ...Array.from(buckets.keys()).filter((sectionId) => sectionId && !sectionIds.includes(sectionId)),
        ];

        return orderedSectionIds.flatMap((sectionId) => {
            const sectionUnits = buckets.get(sectionId) || [];
            return stableShuffle(sectionUnits, `${attemptId}:section:${sectionId || "unsectioned"}`);
        });
    })();

    // 3. Flatten and optionally shuffle MCQ options per-question.
    const orderedQuestions = orderedUnits.flatMap((u) => u.items);
    return orderedQuestions.map((question) => {
        if (!test.shuffleOptions || !question.options?.length) {
            return question;
        }
        return {
            ...question,
            options: stableShuffle(question.options, `${attemptId}:${question.id}:options`),
        };
    });
}

export default function TestAttemptPage() {
    const params = useParams();
    const toast = useToast();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user, firebaseUser, loading: authLoading } = useAuthContext();
    // Force signed-in-but-role-less users through /role-select first.
    useAttemptGate();

    const slug = params.slug as string;
    const testId = searchParams.get("testId");
    const attemptIdFromUrl = searchParams.get("attemptId");
    const contestId = searchParams.get("contestId");
    const classroomTeacherId = searchParams.get("teacherId");
    // Class the student arrived from. Needed by /api/tests/start-attempt to
    // verify enrollment via `classes/{classId}/students` — the legacy
    // teacher-direct enrollment path only works for pre-class-refactor data.
    const classroomClassId = searchParams.get("classId");
    // Either query param means the student is opening this through a
    // classroom. Every "classroom branch" below must trigger on either,
    // otherwise the new class-centric flow falls through to the public
    // catalogue path and 404s.
    const isClassroomContext = Boolean(classroomTeacherId || classroomClassId);
    const classroomParam =
        (classroomTeacherId ? `&teacherId=${encodeURIComponent(classroomTeacherId)}` : "") +
        (classroomClassId ? `&classId=${encodeURIComponent(classroomClassId)}` : "");

    const [_series, setSeries] = useState<TestSeries | null>(null);
    const [contest, setContest] = useState<Contest | null>(null);
    const [test, setTest] = useState<Test | null>(null);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [attempt, setAttempt] = useState<TestAttempt | null>(null);

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [isStarted, setIsStarted] = useState(false);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [codeAnswers, setCodeAnswers] = useState<Record<string, { code: string; language: CodeLanguage }>>({});
    // Live editor drafts - separate from saved codeAnswers to avoid marking as answered prematurely
    const [editorDrafts, setEditorDrafts] = useState<Record<string, { code: string; language: CodeLanguage }>>({});
    const [testCaseResults, setTestCaseResults] = useState<Record<string, Array<{
        input: string;
        expectedOutput: string;
        actualOutput: string;
        passed: boolean;
        isHidden: boolean;
    }>>>({});
    const [codeConsoleOutput, setCodeConsoleOutput] = useState<Record<string, {
        stdout: string;
        stderr: string;
        compileOutput: string;
    }>>({});
    const [runningCode, setRunningCode] = useState(false);
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [markedForReview, setMarkedForReview] = useState<Set<string>>(new Set());
    const [visitedQuestions, setVisitedQuestions] = useState<Set<string>>(new Set());
    const [codeExecutedQuestions, setCodeExecutedQuestions] = useState<Set<string>>(new Set());
    const [showMobileNav, setShowMobileNav] = useState(false);
    const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
    const [editorSize, setEditorSize] = useState<'normal' | 'expanded' | 'fullscreen'>('normal');
    const [editorFontSize, setEditorFontSize] = useState<number>(14);
    const [editorTheme, setEditorTheme] = useState<'vs-light' | 'vs-dark'>('vs-light');
    const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
    const editorContainerRef = useRef<HTMLDivElement>(null);

    // Resizable split panes for fullscreen code editor (percentages of horizontal space)
    const [problemPaneSize, setProblemPaneSize] = useState<number>(28);
    const [resultsPaneSize, setResultsPaneSize] = useState<number>(28);
    const fullscreenSplitRef = useRef<HTMLDivElement>(null);

    // Filter for the question navigator
    type NavFilter = 'all' | 'unanswered' | 'flagged' | 'unrun';
    const [navFilter, setNavFilter] = useState<NavFilter>('all');

    // Track lg+ viewport so we can apply controlled pane widths only on large screens
    const [isLgUp, setIsLgUp] = useState<boolean>(false);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mq = window.matchMedia('(min-width: 1024px)');
        const update = () => setIsLgUp(mq.matches);
        update();
        mq.addEventListener?.('change', update);
        return () => mq.removeEventListener?.('change', update);
    }, []);

    // Disable paste/cut/drop inside Monaco editor (anti-cheat)
    const handleEditorMount = (editor: any, monaco: any) => {
        try {
            // Block paste keybinding
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, () => { /* no-op */ });
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX, () => { /* no-op */ });
            // Block paste via context menu / programmatic
            const dom = editor.getDomNode?.();
            if (dom) {
                const blockPaste = (e: ClipboardEvent | DragEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                };
                dom.addEventListener('paste', blockPaste, true);
                dom.addEventListener('drop', blockPaste, true);
                dom.addEventListener('dragover', (e: DragEvent) => e.preventDefault(), true);
            }
        } catch {
            // ignore if Monaco API surface changes
        }
    };

    // LocalStorage helpers
    const getStorageKey = (attemptId: string) => `digimine:attempt:${attemptId}`;
    const clearLocalProgress = (attemptId: string) => {
        try { localStorage.removeItem(getStorageKey(attemptId)); } catch { /* ignore */ }
    };

    // Guard: ensure init() runs at most once per (user, slug, testId, contestId,
    // classroomTeacherId, attemptIdFromUrl) tuple. React Strict Mode and Next.js
    // router replace can otherwise re-trigger init mid-flight, causing duplicate
    // attempt creation and the "instruction window appears twice" flash.
    const initOnceRef = useRef<string | null>(null);

    // Load initial data
    useEffect(() => {
        if (authLoading) return;

        if (!user || !testId) {
            if (!user) {
                const returnUrl = `/tests/${slug}/attempt?testId=${testId}${contestId ? `&contestId=${contestId}` : ''}${attemptIdFromUrl ? `&attemptId=${attemptIdFromUrl}` : ''}${classroomParam}`;
                router.push(`/login?redirect=${encodeURIComponent(returnUrl)}`);
            } else {
                setLoadError("No test was selected. Please choose a test from the series page.");
                setLoading(false);
            }
            return;
        }

        const initKey = `${user.id}|${slug}|${testId}|${contestId || ""}|${classroomTeacherId || ""}|${classroomClassId || ""}|${attemptIdFromUrl || ""}`;
        if (initOnceRef.current === initKey) return;
        initOnceRef.current = initKey;

        const withTimeout = async <T,>(promise: Promise<T>, message: string, timeoutMs = 30000): Promise<T> => {
            let timeoutId: NodeJS.Timeout | undefined;
            const timeout = new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
            });

            try {
                return await Promise.race([promise, timeout]);
            } finally {
                if (timeoutId) clearTimeout(timeoutId);
            }
        };

        async function initTest() {
            try {
                setLoading(true);
                setLoadError(null);

                let seriesData: TestSeries | null = null;
                let classroomToken: string | null = null;

                // Classroom path: skip client Firestore (it'd fail with permissions) and use server API.
                // Either teacherId OR classId in the URL means we're in a
                // classroom context — both must be accepted.
                if (isClassroomContext) {
                    if (!firebaseUser) {
                        router.push(`/login?redirect=${encodeURIComponent(`/tests/${slug}/attempt?testId=${testId}${classroomParam}`)}`);
                        return;
                    }
                    classroomToken = await firebaseUser.getIdToken();
                    const seriesQs = new URLSearchParams();
                    seriesQs.set("type", "test");
                    seriesQs.set("slug", slug);
                    if (classroomTeacherId) seriesQs.set("teacherId", classroomTeacherId);
                    if (classroomClassId) seriesQs.set("classId", classroomClassId);
                    const res = await fetch(`/api/content/data?${seriesQs.toString()}`, {
                        headers: { Authorization: `Bearer ${classroomToken}` },
                    });
                    const serverData = await res.json();
                    if (!res.ok) throw new Error(serverData.error || "You do not have access to this classroom test.");
                    seriesData = (serverData.content || null) as TestSeries | null;
                } else {
                    seriesData = await withTimeout(
                        getTestSeriesBySlug(slug),
                        "The test series took too long to load. Please check your connection and try again."
                    );
                }

                if (!seriesData) {
                    router.push("/tests");
                    return;
                }

                if (isClassroomContext) {
                    // Classroom students get access without purchase
                    // No purchase check needed — proceed to load test data
                } else {
                    const isEnrolled = await withTimeout(
                        hasUserPurchasedTest(user!.id, seriesData.id),
                        "Could not verify your enrollment. Please refresh and try again."
                    );

                    if (!isEnrolled) {
                        // Check classroom enrollment — enrolled students get free access
                        let classroomAccess = false;
                        try {
                            const accessRes = await fetch(`/api/classroom/content-access?userId=${user!.id}&teacherId=${(seriesData as any).teacherId || ""}`);
                            classroomAccess = (await accessRes.json())?.hasAccess || false;
                        } catch { /* ignore */ }

                        if (classroomAccess) {
                            // Enrolled in classroom — proceed
                        } else if (seriesData.accessType === "free") {
                            await withTimeout(
                                enrollInFreeTestSeries(user!.id, seriesData.id),
                                "Could not enroll you in this free test series. Please try again."
                            );
                        } else {
                            router.push(`/tests/${seriesData.slug}/purchase`);
                            return;
                        }
                    }
                }

                let testData: Test | null = null;
                let questionsData: Question[] = [];

                if (isClassroomContext) {
                    const childQs = new URLSearchParams();
                    childQs.set("type", "test");
                    childQs.set("parentId", seriesData.id);
                    childQs.set("childId", testId!);
                    if (classroomTeacherId) childQs.set("teacherId", classroomTeacherId);
                    if (classroomClassId) childQs.set("classId", classroomClassId);
                    const testRes = await fetch(`/api/content/data?${childQs.toString()}`, {
                        headers: classroomToken ? { Authorization: `Bearer ${classroomToken}` } : {},
                    });
                    const testServerData = await testRes.json();
                    if (!testRes.ok) throw new Error(testServerData.error || "Could not load this classroom test.");
                    testData = (testServerData.test || null) as Test | null;
                    questionsData = (testServerData.questions || []) as Question[];
                } else {
                    [testData, questionsData] = await Promise.all([
                        withTimeout(
                            getTestById(seriesData.id, testId!),
                            "The selected test took too long to load. Please try again."
                        ),
                        withTimeout(
                            getTestQuestions(seriesData.id, testId!),
                            "The questions took too long to load. Please try again."
                        )
                    ]);
                }

                if (!testData) {
                    router.push("/tests");
                    return;
                }

                if (questionsData.length === 0) {
                    throw new Error("This test does not have any published questions yet.");
                }

                setSeries(seriesData);
                setTest(testData);
                setQuestions(questionsData);

                let contestData: Contest | null = null;
                if (contestId) {
                    contestData = await withTimeout(
                        getContestById(contestId),
                        "The contest schedule took too long to load. Please try again."
                    );

                    if (!contestData) {
                        throw new Error("This contest is not available.");
                    }
                    if (contestData.seriesId !== seriesData.id || contestData.testId !== testData.id) {
                        throw new Error("This contest does not match the selected test.");
                    }

                    const now = new Date();
                    if (now < contestData.startTime) {
                        throw new Error(`This contest starts at ${contestData.startTime.toLocaleString()}.`);
                    }
                    if (now >= contestData.endTime) {
                        throw new Error("This contest has ended.");
                    }

                    setContest(contestData);
                } else {
                    setContest(null);
                }

                const contestAttemptContext = contestData
                    ? {
                        contestId: contestData.id,
                        title: contestData.title,
                        startTime: contestData.startTime,
                        endTime: contestData.endTime,
                    }
                    : undefined;
                const createAttempt = async (timeoutMessage: string) => {
                    // Always route through the transactional server API. This makes
                    // attempt creation idempotent (two parallel requests return the
                    // same in-progress attempt) and removes the client-Firestore
                    // race that previously produced duplicate attempts.
                    // Send the user's Firebase ID token so the server can verify
                    // the caller against the body-supplied userId — closes the
                    // pre-existing gap where the route trusted whatever userId
                    // the client put in the body.
                    const idToken = await firebaseUser?.getIdToken();
                    const res = await fetch("/api/tests/start-attempt", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
                        },
                        body: JSON.stringify({
                            userId: user!.id,
                            seriesId: seriesData.id,
                            testId: testId!,
                            contestContext: contestAttemptContext,
                            userAgent: window.navigator.userAgent,
                            // Pass the class context through so the server-side
                            // gate can verify class enrollment (not just legacy
                            // teacher_enrollments).
                            ...(classroomClassId ? { classId: classroomClassId } : {}),
                            ...(classroomTeacherId ? { teacherId: classroomTeacherId } : {}),
                            // For classroom tests the questions doc isn't readable
                            // by the server unless we hand them over.
                            ...(isClassroomContext ? { questions: questionsData } : {}),
                        }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || timeoutMessage);
                    return data.attempt as TestAttempt;
                };

                // Check if we should load a specific attempt or start a new one
                let newAttempt: TestAttempt;

                if (attemptIdFromUrl) {
                    const existing = await getTestAttempt(attemptIdFromUrl);
                    if (!existing) {
                        toast.warning("Attempt not found", {
                            description: "Starting a fresh attempt instead.",
                        });
                        newAttempt = await createAttempt(
                            "Could not create a new attempt. Please try again."
                        );
                    } else if (existing.testId !== testId || existing.seriesId !== seriesData.id || (contestAttemptContext ? existing.contestId !== contestAttemptContext.contestId : Boolean(existing.contestId))) {
                        toast.warning("Different test context", {
                            description:
                                "That attempt was for another test — starting a fresh one here.",
                        });
                        newAttempt = await createAttempt(
                            "Could not create a new attempt. Please try again."
                        );
                    } else if (existing.status === 'completed' || existing.status === 'timed_out') {
                        // Attempt already finished - redirect to results
                        const classroomSuffix = isClassroomContext
                            ? `?${classroomParam.replace(/^&/, "")}`
                            : "";
                        const showResults = isClassroomContext || contestAttemptContext || testData.instantResults;
                        router.push(showResults ? `/dashboard/tests/results/${existing.id}${classroomSuffix}` : `/tests/${seriesData.slug}?submitted=1`);
                        return;
                    } else if (existing.status === 'in_progress') {
                        newAttempt = existing;
                    } else {
                        // Abandoned or other status - start fresh
                        newAttempt = await createAttempt(
                            "Could not create a new attempt. Please try again."
                        );
                    }
                } else {
                    newAttempt = await createAttempt(
                        "Starting the test took too long. If this keeps happening, refresh once so expired attempts can be cleaned up."
                    );
                }

                const displayQuestions = applyTestSettings(questionsData, testData, newAttempt.id);

                setAttempt(newAttempt);
                setQuestions(displayQuestions);
                const sharedContestRemaining = contestData
                    ? Math.max(0, Math.floor((contestData.endTime.getTime() - Date.now()) / 1000))
                    : newAttempt.remainingTime ?? 0;
                setTimeLeft(contestData ? sharedContestRemaining : newAttempt.remainingTime ?? 0);
                setCurrentQuestionIndex(newAttempt.currentQuestionIndex ?? 0);

                // Update URL with attemptId so reloads consistently restore progress.
                // We use history.replaceState (not router.replace) to avoid
                // re-triggering this effect via `useSearchParams`, which would
                // otherwise reload the test data and flash the instructions screen.
                if (!attemptIdFromUrl) {
                    const newUrl = `/tests/${slug}/attempt?testId=${testId}${contestId ? `&contestId=${contestId}` : ''}&attemptId=${newAttempt.id}${classroomParam}`;
                    if (typeof window !== "undefined") {
                        window.history.replaceState(null, "", newUrl);
                    }
                    // Keep the init guard in sync with the now-present attemptId so a
                    // legitimate hook re-render (e.g. firebaseUser refresh) doesn't
                    // think this is a brand-new session.
                    initOnceRef.current = `${user!.id}|${slug}|${testId}|${contestId || ""}|${classroomTeacherId || ""}|${classroomClassId || ""}|${newAttempt.id}`;
                }

                // Load existing answers
                const initialAnswers: Record<string, string> = {};
                const initialCodeAnswers: Record<string, { code: string; language: CodeLanguage }> = {};
                const hasExistingAnswers = (newAttempt.answers?.length || 0) > 0;
                const initialVisited = new Set<string>();

                newAttempt.answers?.forEach(a => {
                    const ansId = (a as any).selectedOptionId || (a as any).answer;
                    if (ansId) {
                        // Check if it's a code answer (JSON object)
                        if (typeof ansId === 'string' && ansId.startsWith('{')) {
                            try {
                                const parsed = JSON.parse(ansId);
                                if (parsed.code && parsed.language) {
                                    initialCodeAnswers[a.questionId] = parsed;
                                }
                            } catch {
                                initialAnswers[a.questionId] = ansId;
                            }
                        } else {
                            initialAnswers[a.questionId] = ansId;
                        }
                    }
                });

                // Initialize editor drafts from code answers or starter codes
                const initialDrafts: Record<string, { code: string; language: CodeLanguage }> = {};
                displayQuestions.forEach(q => {
                    if (q.type === 'code' && q.supportedLanguages && q.supportedLanguages.length > 0) {
                        const saved = initialCodeAnswers[q.id];
                        if (saved) {
                            initialDrafts[q.id] = saved;
                        } else {
                            const defaultLang = q.supportedLanguages[0];
                            const starter = q.starters?.find(s => s.language === defaultLang);
                            initialDrafts[q.id] = { code: starter?.code || '', language: defaultLang };
                        }
                    }
                });

                // Restore from localStorage (merges unsaved editor drafts and recent answers)
                try {
                    const raw = localStorage.getItem(getStorageKey(newAttempt.id));
                    if (raw) {
                        const local = JSON.parse(raw);
                        if (local.editorDrafts) {
                            Object.entries(local.editorDrafts).forEach(([qId, draft]: [string, any]) => {
                                if (draft?.code !== undefined && draft?.language) {
                                    initialDrafts[qId] = draft;
                                }
                            });
                        }
                        if (local.answers) {
                            Object.entries(local.answers).forEach(([qId, ans]) => {
                                if (ans && typeof ans === 'string') initialAnswers[qId] = ans;
                            });
                        }
                        if (local.codeAnswers) {
                            Object.entries(local.codeAnswers).forEach(([qId, draft]: [string, any]) => {
                                if (draft?.code !== undefined && draft?.language) {
                                    initialCodeAnswers[qId] = draft;
                                }
                            });
                        }
                        if (typeof local.currentQuestionIndex === 'number') {
                            setCurrentQuestionIndex(local.currentQuestionIndex);
                        }
                        if (typeof local.timeLeft === 'number') {
                            if (!contestData) setTimeLeft(local.timeLeft);
                        }
                        if (Array.isArray(local.markedForReview)) {
                            setMarkedForReview(new Set(local.markedForReview));
                        }
                        if (Array.isArray(local.visitedQuestions)) {
                            local.visitedQuestions.forEach((id: string) => initialVisited.add(id));
                        }
                        if (Array.isArray(local.codeExecutedQuestions)) {
                            setCodeExecutedQuestions(new Set(local.codeExecutedQuestions));
                        }
                    }
                } catch {
                    // ignore corrupted localStorage
                }

                setEditorDrafts(initialDrafts);
                setAnswers(initialAnswers);
                setCodeAnswers(initialCodeAnswers);

                // Only mark the resumed current question as visited; intermediate
                // questions are only "visited" if the user actually navigated to them
                // (already restored from localStorage above).
                const resumeIdx = newAttempt.currentQuestionIndex || 0;
                if (displayQuestions[resumeIdx]) {
                    initialVisited.add(displayQuestions[resumeIdx].id);
                }
                setVisitedQuestions(initialVisited);

                // If it's a resume (has answers or index > 0), skip instructions
                if (hasExistingAnswers || (newAttempt.currentQuestionIndex ?? 0) > 0) {
                    setIsStarted(true);
                }

                // If time ran out while window was closed, auto-submit
                if ((contestData ? sharedContestRemaining : newAttempt.remainingTime ?? 0) <= 0) {
                    toast.warning("Time's up", {
                        description: "Submitting your test now.",
                    });
                    await finishTest(newAttempt.id, initialAnswers, displayQuestions, 0, "timed_out");
                    return;
                }

            } catch (error: any) {
                console.error("Error initializing test:", error);
                setLoadError(error.message || "Failed to start test");
            } finally {
                setLoading(false);
            }
        }

        initTest();
    }, [user, firebaseUser, slug, testId, contestId, attemptIdFromUrl, classroomTeacherId, classroomClassId, authLoading, router]);

    // Timer Logic
    useEffect(() => {
        if (!attempt || loading || !isStarted) return;
        if (timeLeft <= 0) return;

        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    handleAutoSubmit();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [attempt, loading, isStarted]);

    // Track visited questions when current index changes
    useEffect(() => {
        if (questions[currentQuestionIndex]) {
            setVisitedQuestions(prev => {
                const next = new Set(prev);
                next.add(questions[currentQuestionIndex].id);
                return next;
            });
        }
    }, [currentQuestionIndex, questions]);

    // Periodic autosave
    useEffect(() => {
        if (!attempt || !isStarted || submitting) return;

        const interval = setInterval(() => {
            const s = stateRef.current;
            if (!s.attempt) return;
            if (submittedRef.current) return; // attempt is/was submitted

            const currentQuestion = s.questions[s.currentQuestionIndex];
            let mergedCodeAnswers = s.codeAnswers;
            if (currentQuestion?.type === 'code') {
                const draft = s.editorDrafts[currentQuestion.id];
                if (draft) {
                    mergedCodeAnswers = { ...s.codeAnswers, [currentQuestion.id]: draft };
                }
            }

            setSaveStatus('saving');
            persistAttempt(s.attempt.id, {
                answers: buildAnswersArray(s.answers, mergedCodeAnswers),
                remainingTime: s.timeLeft,
                currentQuestionIndex: s.currentQuestionIndex
            }).then(() => {
                setSaveStatus('saved');
                setLastSavedAt(Date.now());
            }).catch(err => {
                console.error("Autosave failed:", err);
                setSaveStatus('error');
            });
        }, 15000);

        return () => clearInterval(interval);
    }, [attempt, isStarted, submitting]);

    // Persist state to localStorage whenever it changes
    useEffect(() => {
        if (!attempt) return;
        try {
            localStorage.setItem(getStorageKey(attempt.id), JSON.stringify({
                answers,
                codeAnswers,
                editorDrafts,
                currentQuestionIndex,
                timeLeft,
                markedForReview: Array.from(markedForReview),
                visitedQuestions: Array.from(visitedQuestions),
                codeExecutedQuestions: Array.from(codeExecutedQuestions),
                savedAt: Date.now(),
            }));
            setLastSavedAt(Date.now());
        } catch {
            // ignore storage errors (e.g. quota exceeded)
        }
    }, [attempt, answers, codeAnswers, editorDrafts, currentQuestionIndex, timeLeft, markedForReview, visitedQuestions, codeExecutedQuestions]);

    // Hide the global site header/footer while the attempt page is mounted
    useEffect(() => {
        document.body.classList.add('test-attempt-mode');
        return () => { document.body.classList.remove('test-attempt-mode'); };
    }, []);

    // Lock body scroll while editor is fullscreen
    useEffect(() => {
        if (editorSize === 'fullscreen') {
            const prev = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => { document.body.style.overflow = prev; };
        }
    }, [editorSize]);

    // Escape key exits fullscreen
    useEffect(() => {
        if (editorSize !== 'fullscreen') return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setEditorSize('normal');
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [editorSize]);

    // Restore persisted editor pane layout
    useEffect(() => {
        try {
            const raw = localStorage.getItem('digimine:editor-layout');
            if (raw) {
                const p = JSON.parse(raw);
                if (typeof p.problem === 'number' && p.problem >= 12 && p.problem <= 60) setProblemPaneSize(p.problem);
                if (typeof p.results === 'number' && p.results >= 12 && p.results <= 60) setResultsPaneSize(p.results);
                if (typeof p.rightOpen === 'boolean') setIsRightPanelOpen(p.rightOpen);
                if (typeof p.fontSize === 'number') setEditorFontSize(p.fontSize);
                if (p.theme === 'vs-dark' || p.theme === 'vs-light') setEditorTheme(p.theme);
            }
        } catch { /* ignore */ }
    }, []);
    useEffect(() => {
        try {
            localStorage.setItem('digimine:editor-layout', JSON.stringify({
                problem: problemPaneSize,
                results: resultsPaneSize,
                rightOpen: isRightPanelOpen,
                fontSize: editorFontSize,
                theme: editorTheme,
            }));
        } catch { /* ignore */ }
    }, [problemPaneSize, resultsPaneSize, isRightPanelOpen, editorFontSize, editorTheme]);

    // Drag handler for the fullscreen split panes
    const startPaneDrag = (side: 'left' | 'right') => (e: React.PointerEvent) => {
        const container = fullscreenSplitRef.current;
        if (!container) return;
        e.preventDefault();
        const rect = container.getBoundingClientRect();
        const onMove = (ev: PointerEvent) => {
            const x = ev.clientX - rect.left;
            const pct = (x / rect.width) * 100;
            if (side === 'left') {
                setProblemPaneSize(Math.min(60, Math.max(12, pct)));
            } else {
                setResultsPaneSize(Math.min(60, Math.max(12, 100 - pct)));
            }
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    // Anti-cheat: block copy/cut/paste, right-click, screenshot/dev-tool shortcuts,
    // and obscure the page when it loses focus (deters screen sharing/screenshots).
    const [windowFocused, setWindowFocused] = useState(true);
    const [tabSwitchCount, setTabSwitchCount] = useState(0);
    const [showTabSwitchWarning, setShowTabSwitchWarning] = useState(false);
    const wasFocusedRef = useRef(true);

    useEffect(() => {
        if (!isStarted || submitting) return;

        const block = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            const ctrl = e.ctrlKey || e.metaKey;

            // Block copy/cut/paste/select-all globally except inside Monaco's input
            // (we still want students to type, but never paste external content)
            if (ctrl && (key === 'c' || key === 'v' || key === 'x' || key === 'a')) {
                const target = e.target as HTMLElement;
                const inMonaco = target?.closest('.monaco-editor');
                // Allow Ctrl+A/Ctrl+C inside Monaco (typing/selection within editor),
                // but always block Ctrl+V (paste) and Ctrl+X (cut) so external code can't be pasted.
                if (key === 'v' || key === 'x') {
                    e.preventDefault();
                    return;
                }
                if (!inMonaco) {
                    e.preventDefault();
                    return;
                }
            }

            // Block print, save, view-source, dev tools
            if (ctrl && (key === 'p' || key === 's' || key === 'u')) {
                e.preventDefault();
                return;
            }
            if (key === 'f12') {
                e.preventDefault();
                return;
            }
            if (ctrl && e.shiftKey && (key === 'i' || key === 'j' || key === 'c')) {
                e.preventDefault();
                return;
            }

            // Block PrintScreen (best-effort: clears clipboard image)
            if (key === 'printscreen') {
                e.preventDefault();
                try { navigator.clipboard?.writeText?.(''); } catch { /* ignore */ }
            }
        };

        const handleLeave = () => {
            if (wasFocusedRef.current) {
                wasFocusedRef.current = false;
                setWindowFocused(false);
                setTabSwitchCount(c => c + 1);
            }
        };
        const handleReturn = () => {
            if (!wasFocusedRef.current) {
                wasFocusedRef.current = true;
                setWindowFocused(true);
                setShowTabSwitchWarning(true);
            }
        };
        const onFocus = () => handleReturn();
        const onBlur = () => handleLeave();
        const onVisibility = () => {
            if (document.hidden) handleLeave();
            else handleReturn();
        };

        window.addEventListener('copy', block, true);
        window.addEventListener('cut', block, true);
        window.addEventListener('paste', block, true);
        window.addEventListener('contextmenu', block, true);
        window.addEventListener('keydown', handleKeyDown, true);
        window.addEventListener('focus', onFocus);
        window.addEventListener('blur', onBlur);
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            window.removeEventListener('copy', block, true);
            window.removeEventListener('cut', block, true);
            window.removeEventListener('paste', block, true);
            window.removeEventListener('contextmenu', block, true);
            window.removeEventListener('keydown', handleKeyDown, true);
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('blur', onBlur);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [isStarted, submitting]);

    // Beforeunload handler to warn about leaving
    useEffect(() => {
        if (!isStarted || submitting) return;

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = "You have a test in progress. Are you sure you want to leave?";
            return e.returnValue;
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [isStarted, submitting]);

    // Keyboard shortcuts
    useEffect(() => {
        if (!isStarted) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in an input, textarea, or Monaco editor
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            // Ignore if Monaco editor is focused (it uses contenteditable divs)
            const target = e.target as HTMLElement;
            if (target?.closest('.monaco-editor')) return;
            if (showSubmitConfirm) return;

            const currentQuestion = questions[currentQuestionIndex];
            if (!currentQuestion) return;

            // Number keys 1-9 for option selection (MCQ only)
            const num = parseInt(e.key, 10);
            if (currentQuestion.type !== 'code' && !e.ctrlKey && !e.altKey && !e.metaKey && num >= 1 && num <= (currentQuestion.options?.length || 0)) {
                e.preventDefault();
                if (currentQuestion.options) {
                    handleOptionSelect(currentQuestion.options[num - 1].id);
                }
                return;
            }

            switch (e.key) {
                case "ArrowLeft":
                    e.preventDefault();
                    if (currentQuestionIndex > 0) {
                        goToQuestion(currentQuestionIndex - 1);
                    }
                    break;
                case "ArrowRight":
                case "Enter":
                    e.preventDefault();
                    if (currentQuestionIndex < questions.length - 1) {
                        goToQuestion(currentQuestionIndex + 1);
                    }
                    break;
                case "m":
                case "M":
                case "f":
                case "F":
                    e.preventDefault();
                    toggleMarkForReview(currentQuestion.id);
                    break;
                case "c":
                case "C":
                    e.preventDefault();
                    clearAnswer(currentQuestion.id);
                    break;
                case "s":
                case "S": {
                    e.preventDefault();
                    const hasEditorDraft = Object.values(editorDrafts).some(d => d.code?.trim());
                    if (Object.keys(answers).length > 0 || Object.keys(codeAnswers).length > 0 || hasEditorDraft) {
                        setShowSubmitConfirm(true);
                    }
                    break;
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isStarted, currentQuestionIndex, questions, answers, showSubmitConfirm]);

    const stateRef = useRef({ answers, codeAnswers, editorDrafts, timeLeft, attempt, currentQuestionIndex, questions });
    useEffect(() => {
        stateRef.current = { answers, codeAnswers, editorDrafts, timeLeft, attempt, currentQuestionIndex, questions };
    }, [answers, codeAnswers, editorDrafts, timeLeft, attempt, currentQuestionIndex, questions]);

    const buildAnswersArray = (mcqAns: Record<string, string>, codeAns: Record<string, { code: string; language: CodeLanguage }>) => {
        const mcqArray = Object.entries(mcqAns).map(([qId, optId]) => ({
            questionId: qId,
            selectedOptionId: optId,
            timeSpent: 0
        }));
        const codeArray = Object.entries(codeAns).map(([qId, codeAns]) => ({
            questionId: qId,
            selectedOptionId: JSON.stringify(codeAns),
            timeSpent: 0
        }));
        return [...mcqArray, ...codeArray];
    };

    // Save attempt progress. For classroom students we route through the
    // server because the testAttempts rules indirectly require reading the
    // teacher-private series doc (which client SDK cannot do).
    const persistAttempt = async (
        attemptId: string,
        data: { answers: any[]; remainingTime: number; currentQuestionIndex: number }
    ) => {
        if (isClassroomContext) {
            if (!firebaseUser) throw new Error("Not authenticated.");
            const token = await firebaseUser.getIdToken();
            const res = await fetch(`/api/tests/save-attempt`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ attemptId, ...data }),
            });
            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                throw new Error(payload.error || "Failed to save attempt.");
            }
            return;
        }
        await updateTestAttempt(attemptId, data);
    };

    const finalizeAttempt = async (
        attemptId: string,
        data: { answers: any[]; remainingTime: number; finalStatus: "completed" | "timed_out" }
    ): Promise<TestAttempt> => {
        if (isClassroomContext) {
            if (!firebaseUser) throw new Error("Not authenticated.");
            const token = await firebaseUser.getIdToken();
            const res = await fetch(`/api/tests/submit-attempt`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ attemptId, ...data }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload.error || "Failed to submit test.");
            return payload.attempt as TestAttempt;
        }
        return submitTestAttempt(attemptId, data);
    };

    const fetchAttempt = async (attemptId: string): Promise<TestAttempt | null> => {
        if (isClassroomContext) {
            const res = await fetch(`/api/tests/attempt?attemptId=${encodeURIComponent(attemptId)}`);
            if (!res.ok) return null;
            const payload = await res.json().catch(() => ({}));
            return (payload.attempt as TestAttempt) || null;
        }
        return getTestAttempt(attemptId);
    };

    const _saveProgress = async () => {
        if (!attempt || !isStarted) return;
        try {
            const answersArray = buildAnswersArray(answers, codeAnswers);
            await persistAttempt(attempt.id, {
                answers: answersArray,
                remainingTime: timeLeft,
                currentQuestionIndex
            });
        } catch (error) {
            console.error("Error saving progress:", error);
        }
    };

    const handleAutoSubmit = async () => {
        await finishTest(undefined, undefined, undefined, 0, "timed_out");
    };

    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

    const handleOptionSelect = async (optionId: string) => {
        const questionId = questions[currentQuestionIndex].id;
        const newAnswers = {
            ...answers,
            [questionId]: optionId
        };
        setAnswers(newAnswers);

        if (attempt && isStarted) {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }

            debounceTimerRef.current = setTimeout(async () => {
                try {
                    const s = stateRef.current;
                    const currentQuestion = s.questions[s.currentQuestionIndex];
                    let mergedCodeAnswers = s.codeAnswers;
                    if (currentQuestion?.type === 'code') {
                        const draft = s.editorDrafts[currentQuestion.id];
                        if (draft) {
                            mergedCodeAnswers = { ...s.codeAnswers, [currentQuestion.id]: draft };
                        }
                    }
                    await persistAttempt(attempt.id, {
                        answers: buildAnswersArray(newAnswers, mergedCodeAnswers),
                        remainingTime: s.timeLeft,
                        currentQuestionIndex: s.currentQuestionIndex
                    });
                } catch (error) {
                    console.error("Failed to debounced save progress:", error);
                }
            }, 500);
        }
    };

    const clearAnswer = async (questionId: string) => {
        const newAnswers = { ...answers };
        delete newAnswers[questionId];
        setAnswers(newAnswers);

        const newCodeAnswers = { ...codeAnswers };
        delete newCodeAnswers[questionId];
        setCodeAnswers(newCodeAnswers);

        const newDrafts = { ...editorDrafts };
        delete newDrafts[questionId];
        setEditorDrafts(newDrafts);

        if (attempt && isStarted) {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = setTimeout(async () => {
                try {
                    await persistAttempt(attempt.id, {
                        answers: buildAnswersArray(newAnswers, newCodeAnswers),
                        remainingTime: stateRef.current.timeLeft,
                        currentQuestionIndex: stateRef.current.currentQuestionIndex
                    });
                } catch (error) {
                    console.error("Failed to save after clear:", error);
                }
            }, 500);
        }
    };

    const toggleMarkForReview = (questionId: string) => {
        setMarkedForReview(prev => {
            const next = new Set(prev);
            if (next.has(questionId)) {
                next.delete(questionId);
            } else {
                next.add(questionId);
            }
            return next;
        });
    };

    const _saveCurrentEditorDraft = () => {
        const currentQuestion = questions[currentQuestionIndex];
        if (currentQuestion?.type === 'code') {
            const draft = editorDrafts[currentQuestion.id];
            if (draft) {
                setCodeAnswers(prev => ({ ...prev, [currentQuestion.id]: draft }));
            }
        }
    };

    const goToQuestion = async (index: number) => {
        // Save current editor draft before navigating
        const currentQuestion = questions[currentQuestionIndex];
        let mergedCodeAnswers = codeAnswers;
        if (currentQuestion?.type === 'code') {
            const draft = editorDrafts[currentQuestion.id];
            if (draft) {
                mergedCodeAnswers = { ...codeAnswers, [currentQuestion.id]: draft };
                setCodeAnswers(mergedCodeAnswers);
            }
        }

        setCurrentQuestionIndex(index);
        if (attempt && isStarted) {
            try {
                await persistAttempt(attempt.id, {
                    answers: buildAnswersArray(answers, mergedCodeAnswers),
                    remainingTime: timeLeft,
                    currentQuestionIndex: index
                });
            } catch (error) {
                console.error("Error saving progress on navigation:", error);
            }
        }
    };

    // Guard against double-submission: timer auto-submit can race the user's
    // manual Submit click. The first invocation flips this ref to true and
    // every later call short-circuits before any network work happens.
    const submittedRef = useRef(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const finishTest = async (
        overrideAttemptId?: string,
        overrideAnswers?: Record<string, string>,
        overrideQuestions?: Question[],
        overrideTimeLeft?: number,
        overrideFinalStatus?: "completed" | "timed_out"
    ) => {
        const targetAttempt = overrideAttemptId ? { id: overrideAttemptId } : attempt;
        const targetAnswers = overrideAnswers || answers;

        // Merge current editor draft into codeAnswers before submitting
        const currentQuestion = questions[currentQuestionIndex];
        const mergedCodeAnswers = { ...codeAnswers };
        if (currentQuestion?.type === 'code' && editorDrafts[currentQuestion.id]) {
            mergedCodeAnswers[currentQuestion.id] = editorDrafts[currentQuestion.id];
        }

        const targetTimeLeft = overrideTimeLeft ?? timeLeft;
        const finalStatus = overrideFinalStatus ?? (targetTimeLeft <= 0 ? "timed_out" : "completed");

        if (!targetAttempt) return;
        if (submittedRef.current) return; // already submitted or submitting
        submittedRef.current = true;
        setSubmitting(true);
        setSubmitError(null);
        try {
            const answersArray = buildAnswersArray(targetAnswers, mergedCodeAnswers);

            await finalizeAttempt(targetAttempt.id, {
                answers: answersArray,
                remainingTime: targetTimeLeft,
                finalStatus,
            });

            // Verify on the server that the attempt really left in_progress.
            // If a transient error left it stuck, retry the submit once with
            // empty answers so the doc gets finalized either way.
            let confirmed = await fetchAttempt(targetAttempt.id);
            if (confirmed && confirmed.status === "in_progress") {
                try {
                    await finalizeAttempt(targetAttempt.id, {
                        answers: answersArray,
                        remainingTime: targetTimeLeft,
                        finalStatus,
                    });
                    confirmed = await fetchAttempt(targetAttempt.id);
                } catch {
                    // fall through to error state below
                }
            }

            if (!confirmed || confirmed.status === "in_progress") {
                throw new Error("The server did not record the submission. Please retry.");
            }

            clearLocalProgress(targetAttempt.id);

            const classroomSuffix = isClassroomContext
                ? `?${classroomParam.replace(/^&/, "")}`
                : "";
            if (isClassroomContext) {
                // Classroom students always see their result page (instant results
                // are implicit — teachers don't moderate them).
                router.push(`/dashboard/tests/results/${targetAttempt.id}${classroomSuffix}`);
            } else if (contest || confirmed?.contestId || test?.instantResults) {
                router.push(`/dashboard/tests/results/${targetAttempt.id}`);
            } else {
                router.push(`/tests/${slug}?submitted=1`);
            }
        } catch (error: any) {
            console.error("Error submitting test:", error);
            // Allow retry: unlock the guard so the user can press Submit again.
            submittedRef.current = false;
            setSubmitError(
                error?.message ||
                    "Failed to submit test. Please check your connection and try again."
            );
        } finally {
            setSubmitting(false);
        }
    };

    const runCode = async (question: Question) => {
        if (!question.supportedLanguages || !question.testCases) return;
        const codeAns = editorDrafts[question.id];
        if (!codeAns) return;

        setRunningCode(true);
        const results: typeof testCaseResults[string] = [];
        let compileErrorShown = false;
        let rawStdout = "";
        let rawStderr = "";
        let rawCompileOutput = "";

        for (const tc of question.testCases) {
            try {
                const res = await fetch("/api/code/execute", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        language: codeAns.language,
                        code: codeAns.code,
                        stdin: tc.input,
                    }),
                });
                const data = await res.json();

                // Handle API-level errors
                if (!res.ok || data.error) {
                    results.push({
                        input: tc.input,
                        expectedOutput: tc.expectedOutput,
                        actualOutput: data.error || "Code execution service unavailable",
                        passed: false,
                        isHidden: tc.isHidden,
                    });
                    continue;
                }

                const actualOutput = (data.stdout || "").trim();
                const expectedOutput = tc.expectedOutput.trim();

                // Capture raw console output
                if (data.stdout) rawStdout += data.stdout + "\n";
                if (data.stderr) rawStderr += data.stderr + "\n";
                if (data.compileOutput && !rawCompileOutput) rawCompileOutput = data.compileOutput;

                // Build actual output display with errors
                let displayOutput = actualOutput;
                if (data.compileOutput && !compileErrorShown) {
                    displayOutput = `[Compilation Error]:\n${data.compileOutput}\n\n${displayOutput}`;
                    compileErrorShown = true;
                }
                if (data.stderr) {
                    displayOutput += `\n[Runtime Error]: ${data.stderr}`;
                }
                if (data.message && !data.compileOutput && !data.stderr) {
                    displayOutput += `\n[Status]: ${data.message}`;
                }

                results.push({
                    input: tc.input,
                    expectedOutput: tc.expectedOutput,
                    actualOutput: displayOutput || "(empty)",
                    passed: actualOutput === expectedOutput && data.exitCode === 0 && !data.compileOutput,
                    isHidden: tc.isHidden,
                });
            } catch {
                results.push({
                    input: tc.input,
                    expectedOutput: tc.expectedOutput,
                    actualOutput: "Execution failed",
                    passed: false,
                    isHidden: tc.isHidden,
                });
            }
        }

        setTestCaseResults(prev => ({ ...prev, [question.id]: results }));
        setCodeConsoleOutput(prev => ({
            ...prev,
            [question.id]: {
                stdout: rawStdout.trim(),
                stderr: rawStderr.trim(),
                compileOutput: rawCompileOutput,
            }
        }));

        if (results.length > 0) {
            setCodeExecutedQuestions(prev => {
                if (prev.has(question.id)) return prev;
                const next = new Set(prev);
                next.add(question.id);
                return next;
            });
        }
        setRunningCode(false);
    };

    const getQuestionStatus = (questionId: string, idx: number): QuestionStatus => {
        const question = questions.find(q => q.id === questionId);
        const isCode = question?.type === 'code';
        const hasMcqAnswer = !isCode && !!answers[questionId];

        // For code questions: must have non-starter code AND have clicked Run Code at least once
        let hasCodeAnswer = false;
        let hasCodeDraft = false;
        if (isCode) {
            const draft = editorDrafts[questionId] || codeAnswers[questionId];
            if (draft) {
                const starter = question?.starters?.find(s => s.language === draft.language);
                const code = draft.code.trim();
                const starterCode = starter?.code.trim() || '';
                hasCodeDraft = code.length > 0 && code !== starterCode;
                hasCodeAnswer = hasCodeDraft && codeExecutedQuestions.has(questionId);
            }
        }

        const hasAnswer = hasMcqAnswer || hasCodeAnswer;
        const isMarked = markedForReview.has(questionId);
        // Two-tone "marked for review": separate state for answered vs not, so
        // the palette can show both clearly. Clicking the flag alone always
        // changes the colour even if the question has no answer yet.
        if (isMarked && hasAnswer) return "answered_and_marked";
        if (isMarked) return "marked_for_review";
        if (hasAnswer) return "answered";
        // Code question with code written but never executed -> distinct state
        if (isCode && hasCodeDraft) return "code_unrun";
        if (visitedQuestions.has(questionId) || idx === currentQuestionIndex) return "visited";
        return "not_visited";
    };

    const getStatusColor = (status: QuestionStatus, isCurrent: boolean) => {
        if (isCurrent) return "bg-indigo-600 text-white shadow-lg ring-4 ring-indigo-100";
        switch (status) {
            case "answered": return "bg-green-100 text-green-700 hover:bg-green-200";
            // Flagged but no answer: purple (the standard "I'll come back" colour).
            case "marked_for_review": return "bg-purple-100 text-purple-700 hover:bg-purple-200 ring-2 ring-purple-300";
            // Flagged AND answered: green with a purple ring so both signals
            // read at a glance — answered = good, ring = come back to review.
            case "answered_and_marked": return "bg-green-100 text-green-700 hover:bg-green-200 ring-2 ring-purple-400";
            case "code_unrun": return "bg-orange-100 text-orange-700 hover:bg-orange-200 ring-2 ring-orange-300";
            case "visited": return "bg-blue-50 text-blue-600 hover:bg-blue-100";
            default: return "bg-gray-50 text-gray-400 hover:bg-gray-100";
        }
    };

    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h > 0 ? h + ":" : ""}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const getTimerColor = () => {
        if (timeLeft < 60) return "text-red-600 animate-pulse";
        if (timeLeft < 300) return "text-orange-600";
        if (timeLeft < 600) return "text-yellow-600";
        return "text-gray-700";
    };

    const getTimerBg = () => {
        if (timeLeft < 60) return "bg-red-50 border-red-200";
        if (timeLeft < 300) return "bg-orange-50 border-orange-200";
        if (timeLeft < 600) return "bg-yellow-50 border-yellow-200";
        return "bg-gray-50 border-gray-200";
    };

    // "Answered" for the progress meter counts both clean answers and
    // answered-and-marked. Marked-but-unanswered is still pending.
    const answeredCount = questions.reduce((acc, q, i) => {
        const s = getQuestionStatus(q.id, i);
        return s === 'answered' || s === 'answered_and_marked' ? acc + 1 : acc;
    }, 0);
    const progressPercent = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0;

    // Derived lists for the navigator filter & submit-review modal
    const unansweredIndexes = questions
        .map((_, i) => i)
        .filter((i) => {
            const s = getQuestionStatus(questions[i].id, i);
            return s !== 'answered' && s !== 'answered_and_marked';
        });
    const flaggedIndexes = questions
        .map((_, i) => i)
        .filter((i) => markedForReview.has(questions[i].id));
    const unrunIndexes = questions
        .map((_, i) => i)
        .filter((i) => getQuestionStatus(questions[i].id, i) === 'code_unrun');
    const filteredIndexes = (() => {
        switch (navFilter) {
            case 'unanswered': return unansweredIndexes;
            case 'flagged': return flaggedIndexes;
            case 'unrun': return unrunIndexes;
            default: return questions.map((_, i) => i);
        }
    })();

    // Passage-group metadata for reading-comprehension / logical sets.
    //   setNumberById[group]      -> 1-based set number (in display order)
    //   setSizeById[group]        -> count of questions in the set
    //   setPositionByIdx[qIdx]    -> 1-based position of that question within its set
    const setNumberById = new Map<string, number>();
    const setSizeById = new Map<string, number>();
    const setPositionByIdx = new Map<number, number>();
    questions.forEach((q, idx) => {
        const g = q.passageGroup?.trim();
        if (!g) return;
        if (!setNumberById.has(g)) setNumberById.set(g, setNumberById.size + 1);
        const nextPos = (setSizeById.get(g) || 0) + 1;
        setSizeById.set(g, nextPos);
        setPositionByIdx.set(idx, nextPos);
    });

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
                <div className="text-center max-w-md px-6">
                    <div className="relative w-20 h-20 mx-auto mb-6">
                        <div className="absolute inset-0 rounded-full border-4 border-gray-700"></div>
                        <div className="absolute inset-0 rounded-full border-4 border-t-indigo-500 border-r-transparent border-b-transparent border-l-transparent animate-spin"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                    </div>
                    <h2 className="text-xl font-bold mb-2 text-white">Preparing your test environment...</h2>
                    <p className="text-gray-400 text-sm">Loading questions and restoring your progress</p>
                    <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-500">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        Secure connection established
                    </div>
                </div>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <Card className="max-w-md w-full p-8 text-center">
                    <div className="w-16 h-16 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                    </div>
                    <h1 className="text-xl font-bold text-gray-900">Could not start the test</h1>
                    <p className="mt-3 text-sm text-gray-600">{loadError}</p>
                    <div className="mt-6 flex flex-col sm:flex-row gap-3">
                        <Button onClick={() => window.location.reload()} className="flex-1 bg-indigo-600 text-white hover:bg-indigo-700">
                            Try Again
                        </Button>
                        <Link href={`/tests/${slug}`} className="flex-1">
                            <Button variant="outline" className="w-full">
                                Back to Series
                            </Button>
                        </Link>
                    </div>
                </Card>
            </div>
        );
    }

    if (!test || questions.length === 0) return null;

    const testSections = getSortedTestSections(test);
    const sectionById = new Map(testSections.map((section) => [section.id, section]));
    const currentQuestion = questions[currentQuestionIndex];
    const currentSection = currentQuestion?.sectionId ? sectionById.get(currentQuestion.sectionId) : undefined;
    const currentQuestionScoring = currentQuestion ? getQuestionScoring(test, currentQuestion) : { marks: 0, negativeMarks: 0 };
    const maxPossibleScore = questions.reduce((sum, question) => sum + getQuestionScoring(test, question).marks, 0) || test.totalMarks;
    const buildSectionGroups = (indexes: number[]) => {
        if (testSections.length === 0) {
            return [{ id: "", title: "", description: "", indexes }];
        }

        const groups = testSections.map((section) => ({
            id: section.id,
            title: section.title,
            description: section.description || "",
            indexes: indexes.filter((idx) => questions[idx]?.sectionId === section.id),
        }));
        const unsectionedIndexes = indexes.filter((idx) => {
            const sectionId = questions[idx]?.sectionId;
            return !sectionId || !sectionById.has(sectionId);
        });

        if (unsectionedIndexes.length > 0) {
            groups.push({ id: "", title: "Unsectioned", description: "", indexes: unsectionedIndexes });
        }

        return groups.filter((group) => group.indexes.length > 0);
    };

    if (!isStarted) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <Card className="max-w-2xl w-full p-8 shadow-2xl border-none">
                    <div className="text-center mb-8">
                        <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl shadow-inner">
                            {Object.keys(answers).length > 0 ? (
                                <RefreshIcon className="h-9 w-9" />
                            ) : (
                                <FileTextIcon className="h-9 w-9" />
                            )}
                        </div>
                        <h1 className="text-3xl font-bold text-gray-900">
                            {Object.keys(answers).length > 0 ? 'Resume Your Test' : 'Test Instructions'}
                        </h1>
                        <p className="text-gray-500 mt-2">{test.title}</p>
                    </div>

                    <div className="space-y-6 bg-gray-50 p-6 rounded-xl border border-gray-100 mb-8">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="flex items-center gap-2 text-gray-600">
                                <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="font-bold">Duration:</span> {test.duration} Minutes
                            </div>
                            <div className="flex items-center gap-2 text-gray-600">
                                <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="font-bold">Questions:</span> {questions.length}
                            </div>
                            <div className="flex items-center gap-2 text-gray-600">
                                <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="font-bold">Total Marks:</span> {maxPossibleScore}
                            </div>
                            <div className="flex items-center gap-2 text-gray-600">
                                <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <span className="font-bold">Passing Marks:</span> {test.passingMarks}
                            </div>
                            {testSections.length > 0 && (
                                <div className="flex items-center gap-2 text-gray-600">
                                    <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                                    </svg>
                                    <span className="font-bold">Sections:</span> {testSections.length}
                                </div>
                            )}
                        </div>

                        {testSections.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {testSections.map((section) => (
                                    <span key={section.id} className="inline-flex rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
                                        {section.title}
                                        {section.cutoffMarks !== undefined ? ` · Cutoff ${section.cutoffMarks}` : ""}
                                    </span>
                                ))}
                            </div>
                        )}

                        <hr className="border-gray-200" />

                        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
                            <p className="font-bold flex items-center gap-2">
                                <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                Important Rules:
                            </p>
                            <ul className="list-disc list-inside space-y-2 opacity-80">
                                <li>Do not refresh or close the page during the test.</li>
                                <li>Your progress is automatically saved as you answer.</li>
                                <li>The test will automatically submit when the timer hits zero.</li>
                                <li>Use number keys <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">1</kbd>-<kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">4</kbd> to select options quickly.</li>
                                <li>Press <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">M</kbd> to mark a question for review.</li>
                                <li>Press <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">←</kbd> <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">→</kbd> to navigate between questions.</li>
                                {Object.keys(answers).length > 0 && (
                                    <li className="text-indigo-600 font-bold">You are resuming an existing attempt. Your previous answers have been restored.</li>
                                )}
                            </ul>
                        </div>
                    </div>

                    <Button
                        onClick={() => setIsStarted(true)}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-6 text-lg font-bold shadow-lg shadow-indigo-200"
                    >
                        {Object.keys(answers).length > 0 ? 'Resume Test Now' : 'I Understand, Start Test'}
                    </Button>

                    <p className="text-center text-xs text-gray-400 mt-6 uppercase tracking-widest font-bold">
                        Professional Testing Environment by PlacementRanker
                    </p>
                </Card>
            </div>
        );
    }

    return (
        <div
            className={`min-h-screen bg-[#F8FAFC] flex flex-col select-none transition-[filter] duration-150 ${!windowFocused ? 'blur-md' : ''}`}
            style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
            onContextMenu={(e) => e.preventDefault()}
        >
            {/* Focus-loss screen privacy overlay */}
            {!windowFocused && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 pointer-events-none">
                    <div className="text-center text-white max-w-md">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/10 flex items-center justify-center">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold mb-2 text-white">Test paused for privacy</h2>
                        <p className="text-sm text-white/80">
                            The test content is hidden because the window is not focused. Return to this tab to continue.
                        </p>
                    </div>
                </div>
            )}

            {/* Tab Switch Warning Modal */}
            {showTabSwitchWarning && windowFocused && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="tab-warning-title">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                    <Card className={`relative max-w-md w-full p-6 shadow-2xl border-2 ${tabSwitchCount >= 3 ? 'border-red-500' : 'border-amber-400'}`}>
                        <div className="text-center">
                            <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${tabSwitchCount >= 3 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <h2 id="tab-warning-title" className={`text-xl font-bold mb-2 ${tabSwitchCount >= 3 ? 'text-red-700' : 'text-gray-900'}`}>
                                {tabSwitchCount >= 3 ? 'Final Warning!' : 'You left the test window'}
                            </h2>
                            <p className="text-sm text-gray-600 mb-4">
                                Switching tabs or leaving the test window is not allowed during a test. This activity is being recorded.
                            </p>
                            <div className={`rounded-lg p-3 mb-5 ${tabSwitchCount >= 3 ? 'bg-red-50' : 'bg-amber-50'}`}>
                                <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">Tab switch count</p>
                                <p className={`text-3xl font-bold ${tabSwitchCount >= 3 ? 'text-red-600' : 'text-amber-600'}`}>
                                    {tabSwitchCount}
                                </p>
                                {tabSwitchCount >= 3 && (
                                    <p className="text-xs text-red-600 font-semibold mt-1">
                                        Repeated violations may lead to test cancellation.
                                    </p>
                                )}
                            </div>
                            <Button
                                onClick={() => setShowTabSwitchWarning(false)}
                                className={`w-full text-white ${tabSwitchCount >= 3 ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                            >
                                I understand, continue test
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* Header */}
            <header className="bg-white/95 backdrop-blur-sm border-b px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-30 shadow-sm">
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        onClick={() => setShowMobileNav(true)}
                        className="lg:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                        title="Open question navigator"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                        </svg>
                    </button>
                    <h1 className="hidden sm:block text-base sm:text-lg font-bold text-gray-900 truncate max-w-[180px] sm:max-w-[260px]">{test.title}</h1>
                    <span className="inline-flex bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap">
                        Q {currentQuestionIndex + 1}<span className="opacity-60">/{questions.length}</span>
                    </span>
                </div>

                <div className="flex items-center gap-3 sm:gap-6">
                    <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium" aria-live="polite" aria-atomic="true">
                    {saveStatus === 'saving' ? (
                        <>
                            <svg className="w-3.5 h-3.5 text-indigo-500 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            <span className="text-gray-500">Saving...</span>
                        </>
                    ) : saveStatus === 'error' ? (
                        <>
                            <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                            <span className="text-red-600">Save failed - retrying</span>
                        </>
                    ) : lastSavedAt ? (
                        <>
                            <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="text-gray-500">Auto-saved</span>
                        </>
                    ) : null}
                </div>
                <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border ${getTimerBg()}`}>
                        <svg className={`w-5 h-5 ${getTimerColor()}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className={`font-mono text-lg font-bold ${getTimerColor()}`}>
                            {formatTime(timeLeft)}
                        </span>
                    </div>
                    <div className={`sm:hidden font-mono text-base font-bold ${getTimerColor()}`}>
                        {formatTime(timeLeft)}
                    </div>
                    <Button
                        onClick={() => setShowSubmitConfirm(true)}
                        disabled={submitting}
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 sm:px-8"
                    >
                        {submitting ? "Submitting..." : "Finish"}
                    </Button>
                </div>
            </header>

            {/* Progress Bar */}
            <div className="bg-white/95 backdrop-blur-sm border-b sticky top-[57px] sm:top-[61px] z-20">
                <div className="h-1.5 bg-gray-100 w-full">
                    <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
                <div className="px-4 sm:px-6 py-1.5 flex items-center justify-between text-xs text-gray-500">
                    <span>{answeredCount} of {questions.length} answered</span>
                    <span>{Math.round(progressPercent)}% complete</span>
                </div>
            </div>

            <main className="flex-1 flex">
                {/* Question Area */}
                <div className="flex-1 p-4 sm:p-8 min-w-0">
                    <div className="max-w-3xl mx-auto space-y-6 sm:space-y-8">
                        {/* Shared Passage (reading comprehension / logical set) */}
                        {currentQuestion.passage && currentQuestion.passageGroup && (
                            <div className="bg-amber-50/60 rounded-2xl p-5 sm:p-6 border border-amber-200/80 shadow-sm">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 uppercase tracking-wider">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                        </svg>
                                        Reading Passage · Set {setNumberById.get(currentQuestion.passageGroup) || ''}
                                    </span>
                                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                                        Q {setPositionByIdx.get(currentQuestionIndex) || 1} of {setSizeById.get(currentQuestion.passageGroup) || 1} in this set
                                    </span>
                                </div>
                                <FormattedContent
                                    html={currentQuestion.passage}
                                    size="base"
                                    className="text-gray-800"
                                />
                            </div>
                        )}

                        {/* Question Text */}
                        <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100">
                            <div className="flex items-center justify-between mb-4 sm:mb-6">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <span className="text-sm font-bold text-indigo-600 uppercase tracking-wider">Question {currentQuestionIndex + 1}</span>
                                    {currentSection && (
                                        <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                                            {currentSection.title}
                                        </span>
                                    )}
                                    {currentQuestion.passageGroup && (
                                        <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                                            Set {setNumberById.get(currentQuestion.passageGroup) || ''}
                                        </span>
                                    )}
                                    {markedForReview.has(currentQuestion.id) && (
                                        <span className="inline-flex items-center gap-1 text-xs font-bold text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                            </svg>
                                            Marked for Review
                                        </span>
                                    )}
                                </div>
                                <span className="text-sm text-gray-400">
                                    {currentQuestionScoring.marks} Marks
                                    {currentQuestionScoring.negativeMarks > 0 ? ` · -${currentQuestionScoring.negativeMarks}` : ""}
                                </span>
                            </div>
                            <FormattedContent
                                html={currentQuestion.questionText}
                                size="lg"
                                className="text-gray-800 font-medium"
                            />
                        </div>

                        {/* MCQ Options */}
                        {currentQuestion.type !== 'code' && (
                            <div className="grid grid-cols-1 gap-3 sm:gap-4">
                                {currentQuestion.options?.map((option, optIdx) => (
                                    <button
                                        key={option.id}
                                        onClick={() => handleOptionSelect(option.id)}
                                        className={`flex items-center gap-4 p-4 sm:p-5 rounded-xl border-2 transition-all text-left group ${
                                            answers[currentQuestion.id] === option.id
                                                ? "border-indigo-600 bg-indigo-50 shadow-md translate-x-1"
                                                : "border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm"
                                        }`}
                                    >
                                        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 text-sm font-bold transition-colors ${
                                            answers[currentQuestion.id] === option.id
                                                ? "border-indigo-600 bg-indigo-600 text-white"
                                                : "border-gray-300 text-gray-400 group-hover:border-gray-400"
                                        }`}>
                                            {answers[currentQuestion.id] === option.id ? (
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                            ) : (
                                                OPTION_LABELS[optIdx]
                                            )}
                                        </div>
                                        <FormattedContent
                                            html={option.text}
                                            size="base"
                                            className="flex-1 text-base sm:text-lg text-gray-700"
                                        />
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Code Editor */}
                        {currentQuestion.type === 'code' && (
                            <div className={editorSize === 'fullscreen' ? 'hidden' : 'space-y-4'} ref={editorContainerRef}>
                                {/* Toolbar */}
                                <div className="flex flex-wrap items-center gap-3 justify-between">
                                    <div className="flex items-center gap-3">
                                        <label className="text-sm font-medium text-gray-700">Language:</label>
                                        <select
                                            value={editorDrafts[currentQuestion.id]?.language || currentQuestion.supportedLanguages?.[0] || 'python'}
                                            onChange={(e) => {
                                                const lang = e.target.value as CodeLanguage;
                                                const starter = currentQuestion.starters?.find(s => s.language === lang);
                                                setEditorDrafts(prev => ({
                                                    ...prev,
                                                    [currentQuestion.id]: {
                                                        code: starter?.code || '',
                                                        language: lang,
                                                    }
                                                }));
                                            }}
                                            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                                        >
                                            {currentQuestion.supportedLanguages?.map(lang => (
                                                <option key={lang} value={lang}>
                                                    {lang === 'cpp' ? 'C++' : lang.charAt(0).toUpperCase() + lang.slice(1)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                                            <button
                                                type="button"
                                                onClick={() => setEditorFontSize(s => Math.max(10, s - 1))}
                                                className="px-2 py-1 text-xs font-bold text-gray-600 hover:text-gray-900 rounded"
                                                title="Decrease font size"
                                                aria-label="Decrease font size"
                                            >A-</button>
                                            <span className="px-1.5 text-xs font-mono text-gray-500 tabular-nums">{editorFontSize}</span>
                                            <button
                                                type="button"
                                                onClick={() => setEditorFontSize(s => Math.min(28, s + 1))}
                                                className="px-2 py-1 text-xs font-bold text-gray-600 hover:text-gray-900 rounded"
                                                title="Increase font size"
                                                aria-label="Increase font size"
                                            >A+</button>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setEditorTheme(t => t === 'vs-light' ? 'vs-dark' : 'vs-light')}
                                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
                                            title={editorTheme === 'vs-light' ? 'Switch to dark theme' : 'Switch to light theme'}
                                            aria-label="Toggle editor theme"
                                        >
                                            {editorTheme === 'vs-light' ? (
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                                            ) : (
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setEditorSize(s => s === 'expanded' ? 'normal' : 'expanded')}
                                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
                                            title={editorSize === 'expanded' ? 'Shrink editor' : 'Expand editor'}
                                            aria-label="Toggle expanded editor"
                                        >
                                            {editorSize === 'expanded' ? (
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 13H5" /></svg>
                                            ) : (
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m-7-7h14" /></svg>
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setEditorSize('fullscreen')}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold"
                                            title="Maximize editor (fullscreen)"
                                            aria-label="Maximize code editor"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                                            Maximize
                                        </button>
                                    </div>
                                </div>

                                {/* Monaco Editor */}
                                <div className="border border-gray-200 rounded-xl overflow-hidden">
                                    <Editor
                                        height={editorSize === 'expanded' ? '600px' : '420px'}
                                        language={LANGUAGE_MAP[editorDrafts[currentQuestion.id]?.language || currentQuestion.supportedLanguages?.[0] || 'python']}
                                        value={editorDrafts[currentQuestion.id]?.code || ''}
                                        onChange={(value) => {
                                            const lang = editorDrafts[currentQuestion.id]?.language || currentQuestion.supportedLanguages?.[0] || 'python';
                                            setEditorDrafts(prev => ({
                                                ...prev,
                                                [currentQuestion.id]: {
                                                    code: value || '',
                                                    language: lang,
                                                }
                                            }));
                                        }}
                                        theme={editorTheme}
                                        onMount={handleEditorMount}
                                        options={{
                                            minimap: { enabled: false },
                                            fontSize: editorFontSize,
                                            scrollBeyondLastLine: false,
                                            automaticLayout: true,
                                            contextmenu: false,
                                        }}
                                        loading={<div className="h-80 flex items-center justify-center text-gray-400">Loading editor...</div>}
                                    />
                                </div>

                                {/* Visible Test Cases Preview */}
                                {currentQuestion.testCases && currentQuestion.testCases.filter(tc => !tc.isHidden).length > 0 && (
                                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col max-h-64">
                                        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between shrink-0">
                                            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Test Cases</span>
                                            <span className="text-[10px] text-gray-400 font-medium">{currentQuestion.testCases.filter(tc => !tc.isHidden).length} visible</span>
                                        </div>
                                        <div className="divide-y divide-gray-100 overflow-y-auto">
                                            {currentQuestion.testCases.filter(tc => !tc.isHidden).map((tc, idx) => (
                                                <div key={idx} className="px-4 py-2.5 text-xs font-mono space-y-1">
                                                    <div className="flex items-start gap-2">
                                                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded shrink-0 mt-0.5">Case {idx + 1}</span>
                                                    </div>
                                                    <div className="pl-1 border-l-2 border-gray-200 space-y-0.5">
                                                        <div><span className="text-gray-400">Input:</span> <span className="text-gray-700 whitespace-pre-wrap">{tc.input || '(empty)'}</span></div>
                                                        <div><span className="text-gray-400">Expected:</span> <span className="text-gray-700 whitespace-pre-wrap">{tc.expectedOutput || '(empty)'}</span></div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Run Code Button */}
                                <div className="flex items-center gap-3">
                                    <Button
                                        onClick={() => runCode(currentQuestion)}
                                        disabled={runningCode || !(editorDrafts[currentQuestion.id]?.code?.trim())}
                                        variant="outline"
                                        className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                    >
                                        {runningCode ? (
                                            <span className="flex items-center gap-2">
                                                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                </svg>
                                                Running...
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-2">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                Run Code
                                            </span>
                                        )}
                                    </Button>
                                    <span className="text-xs text-gray-400">
                                        {currentQuestion.testCases?.filter(tc => !tc.isHidden).length || 0} visible test case(s)
                                    </span>
                                    {!codeExecutedQuestions.has(currentQuestion.id) && (
                                        <span className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 text-xs font-bold border border-orange-200" role="status">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            Run code at least once to mark this question answered
                                        </span>
                                    )}
                                </div>

                                {/* Test Case Results */}
                                {testCaseResults[currentQuestion.id] && (
                                    <div className="space-y-3">
                                        {testCaseResults[currentQuestion.id].map((result, idx) => (
                                            <div key={idx} className={`p-4 rounded-xl border ${result.passed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-sm font-bold">
                                                        {result.isHidden ? 'Hidden Test Case' : `Test Case ${idx + 1}`}
                                                    </span>
                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${result.passed ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                                                        {result.passed ? 'Passed' : 'Failed'}
                                                    </span>
                                                </div>
                                                {!result.isHidden && (
                                                    <div className="space-y-1 text-xs font-mono">
                                                        <div><span className="text-gray-500">Input:</span> <span className="text-gray-700">{result.input || '(empty)'}</span></div>
                                                        <div><span className="text-gray-500">Expected:</span> <span className="text-gray-700">{result.expectedOutput || '(empty)'}</span></div>
                                                        <div><span className="text-gray-500">Actual:</span> <span className={result.passed ? 'text-green-700' : 'text-red-700'}>{result.actualOutput || '(empty)'}</span></div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Action Bar */}
                        <div className="flex flex-wrap items-center gap-3 pt-2">
                            <button
                                onClick={() => toggleMarkForReview(currentQuestion.id)}
                                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    markedForReview.has(currentQuestion.id)
                                        ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
                                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                }`}
                                title="Press M to toggle"
                            >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                                {markedForReview.has(currentQuestion.id) ? "Unmark Review" : "Mark for Review"}
                            </button>
                            {(answers[currentQuestion.id] || codeAnswers[currentQuestion.id] || (currentQuestion.type === 'code' && editorDrafts[currentQuestion.id]?.code?.trim())) && (
                                <button
                                    onClick={() => clearAnswer(currentQuestion.id)}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
                                    title="Press C to clear"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    Clear Answer
                                </button>
                            )}
                        </div>

                        {/* Navigation Buttons */}
                        <div className="flex items-center justify-between pt-6 pb-8">
                            <Button
                                variant="outline"
                                onClick={() => goToQuestion(Math.max(0, currentQuestionIndex - 1))}
                                disabled={currentQuestionIndex === 0}
                                className="px-6 sm:px-8"
                                leftIcon={
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                }
                            >
                                Previous
                            </Button>
                            <Button
                                onClick={() => {
                                    if (currentQuestionIndex < questions.length - 1) {
                                        goToQuestion(currentQuestionIndex + 1);
                                    } else {
                                        setShowSubmitConfirm(true);
                                    }
                                }}
                                className="bg-gray-900 hover:bg-black text-white px-6 sm:px-8"
                                rightIcon={
                                    currentQuestionIndex < questions.length - 1 ? (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    ) : undefined
                                }
                            >
                                {currentQuestionIndex === questions.length - 1 ? "Review & Submit" : "Save & Next"}
                            </Button>
                        </div>

                        {/* Keyboard Shortcuts Hint */}
                        <div className="hidden lg:flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-gray-400 pb-4">
                            <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-gray-100 rounded font-mono">1-9</kbd> Select option</span>
                            <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-gray-100 rounded font-mono">← →</kbd> Navigate</span>
                            <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-gray-100 rounded font-mono">M</kbd>/<kbd className="px-1.5 py-0.5 bg-gray-100 rounded font-mono">F</kbd> Flag</span>
                            <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-gray-100 rounded font-mono">C</kbd> Clear</span>
                            <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-gray-100 rounded font-mono">S</kbd> Submit</span>
                            <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-gray-100 rounded font-mono">Esc</kbd> Exit fullscreen</span>
                        </div>
                    </div>
                </div>

                {/* Right Sidebar - Navigator */}
                <aside className="w-80 bg-white border-l hidden lg:block self-start sticky top-[100px] max-h-[calc(100vh-100px)] overflow-y-auto">
                    <div className="p-6">
                        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                            </svg>
                            Question Navigator
                        </h3>

                        {/* Filter chips */}
                        <div className="flex flex-wrap gap-1.5 mb-4" role="tablist" aria-label="Filter questions">
                            {([
                                { key: 'all', label: 'All', count: questions.length },
                                { key: 'unanswered', label: 'Unanswered', count: unansweredIndexes.length },
                                { key: 'flagged', label: 'Flagged', count: flaggedIndexes.length },
                                { key: 'unrun', label: 'Not run', count: unrunIndexes.length },
                            ] as { key: NavFilter; label: string; count: number }[]).map((f) => {
                                const active = navFilter === f.key;
                                if (f.key === 'unrun' && unrunIndexes.length === 0) return null;
                                return (
                                    <button
                                        key={f.key}
                                        type="button"
                                        role="tab"
                                        aria-selected={active}
                                        onClick={() => setNavFilter(f.key)}
                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors ${
                                            active
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                    >
                                        {f.label}
                                        <span className={`px-1 rounded-full text-[10px] ${active ? 'bg-white/20' : 'bg-white text-gray-600'}`}>{f.count}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {filteredIndexes.length === 0 ? (
                            <div className="text-center text-xs text-gray-400 py-8 border border-dashed border-gray-200 rounded-xl">
                                Nothing to show in this filter.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {buildSectionGroups(filteredIndexes).map((group) => (
                                    <div key={group.id || "unsectioned"}>
                                        {group.title && (
                                            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                                                {group.title}
                                            </div>
                                        )}
                                        <div className="grid grid-cols-5 gap-2">
                                            {group.indexes.map((idx) => {
                                                const q = questions[idx];
                                                const status = getQuestionStatus(q.id, idx);
                                                const isCode = q.type === 'code';
                                                const setNum = q.passageGroup ? setNumberById.get(q.passageGroup) : undefined;
                                                return (
                                                    <button
                                                        key={idx}
                                                        onClick={() => goToQuestion(idx)}
                                                        className={`relative w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm transition-all ${getStatusColor(status, currentQuestionIndex === idx)} ${setNum ? 'ring-2 ring-offset-1 ring-amber-300/70' : ''}`}
                                                        title={`Q${idx + 1} (${isCode ? 'code' : 'mcq'})${group.title ? ` · ${group.title}` : ''}${setNum ? ` · Set ${setNum}` : ''}: ${status.replace(/_/g, ' ')}`}
                                                    >
                                                        {idx + 1}
                                                        {isCode && (
                                                            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm" aria-label="code question">
                                                                <svg className="w-2.5 h-2.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8 9l-4 3 4 3m8-6l4 3-4 3" /></svg>
                                                            </span>
                                                        )}
                                                        {setNum && (
                                                            <span
                                                                className="absolute -bottom-1 -left-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center shadow-sm"
                                                                aria-label={`set ${setNum}`}
                                                            >
                                                                S{setNum}
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {(() => {
                            const codeUnrunCount = questions.filter((q, i) => getQuestionStatus(q.id, i) === 'code_unrun').length;
                            const answeredTotal = questions.filter((q, i) => {
                                const s = getQuestionStatus(q.id, i);
                                return s === 'answered' || s === 'answered_and_marked';
                            }).length;
                            const codeQuestionCount = questions.filter(q => q.type === 'code').length;
                            return (
                                <div className="mt-8 space-y-3">
                                    <div className="flex items-center gap-3 text-sm text-gray-600">
                                        <div className="w-4 h-4 rounded bg-green-100 border border-green-200"></div>
                                        <span>Answered ({answeredTotal})</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-gray-600">
                                        <div className="w-4 h-4 rounded bg-purple-100 border border-purple-200 ring-1 ring-purple-300"></div>
                                        <span>Marked for Review ({markedForReview.size})</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-gray-600">
                                        <div className="w-4 h-4 rounded bg-green-100 border border-green-200 ring-1 ring-purple-400"></div>
                                        <span>Answered & Marked ({questions.filter((q, i) => getQuestionStatus(q.id, i) === 'answered_and_marked').length})</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-gray-600">
                                        <div className="w-4 h-4 rounded bg-orange-100 border border-orange-200 ring-1 ring-orange-300"></div>
                                        <span>Code not run yet ({codeUnrunCount})</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-gray-600">
                                        <div className="w-4 h-4 rounded bg-blue-50 border border-blue-100"></div>
                                        <span>Visited ({visitedQuestions.size})</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-gray-600">
                                        <div className="w-4 h-4 rounded bg-gray-50 border border-gray-100"></div>
                                        <span>Not Visited ({questions.length - visitedQuestions.size})</span>
                                    </div>
                                    {codeQuestionCount > 0 && (
                                        <div className="flex items-center gap-3 text-xs text-gray-500 pt-2 border-t border-gray-100">
                                            <span className="w-4 h-4 rounded-full bg-white border border-gray-200 flex items-center justify-center">
                                                <svg className="w-2.5 h-2.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8 9l-4 3 4 3m8-6l4 3-4 3" /></svg>
                                            </span>
                                            <span>Coding question marker</span>
                                        </div>
                                    )}
                                    {setNumberById.size > 0 && (
                                        <div className="flex items-center gap-3 text-xs text-gray-500 pt-2 border-t border-gray-100">
                                            <span className="min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">S1</span>
                                            <span>Reading / logical set ({setNumberById.size} set{setNumberById.size === 1 ? '' : 's'})</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Summary Card */}
                        <div className="mt-8 p-4 bg-gray-50 rounded-xl border border-gray-100">
                            <div className="text-sm font-bold text-gray-700 mb-2">Attempt Summary</div>
                            <div className="space-y-1 text-xs text-gray-500">
                                <div className="flex justify-between">
                                    <span>Answered</span>
                                    <span className="font-bold text-gray-700">{answeredCount} / {questions.length}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Unanswered</span>
                                    <span className="font-bold text-gray-700">{questions.length - answeredCount}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Marked for Review</span>
                                    <span className="font-bold text-purple-600">{markedForReview.size}</span>
                                </div>
                            </div>
                            <Button
                                onClick={() => setShowSubmitConfirm(true)}
                                disabled={submitting}
                                size="sm"
                                className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white"
                            >
                                {submitting ? "Submitting..." : "Submit Test"}
                            </Button>
                        </div>
                    </div>
                </aside>
            </main>

            {/* Mobile Navigator Drawer */}
            {showMobileNav && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setShowMobileNav(false)} />
                    <div className="absolute right-0 top-0 bottom-0 w-80 bg-white shadow-2xl overflow-y-auto">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                                    </svg>
                                    Navigator
                                </h3>
                                <button onClick={() => setShowMobileNav(false)} className="p-2 rounded-lg hover:bg-gray-100">
                                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            <div className="space-y-4">
                                {buildSectionGroups(questions.map((_, idx) => idx)).map((group) => (
                                    <div key={group.id || "unsectioned-mobile"}>
                                        {group.title && (
                                            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                                                {group.title}
                                            </div>
                                        )}
                                        <div className="grid grid-cols-5 gap-2">
                                            {group.indexes.map((idx) => {
                                                const q = questions[idx];
                                                const status = getQuestionStatus(q.id, idx);
                                                const isCode = q.type === 'code';
                                                const setNum = q.passageGroup ? setNumberById.get(q.passageGroup) : undefined;
                                                return (
                                                    <button
                                                        key={idx}
                                                        onClick={() => { goToQuestion(idx); setShowMobileNav(false); }}
                                                        className={`relative w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm transition-all ${getStatusColor(status, currentQuestionIndex === idx)} ${setNum ? 'ring-2 ring-offset-1 ring-amber-300/70' : ''}`}
                                                    >
                                                        {idx + 1}
                                                        {isCode && (
                                                            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                                                                <svg className="w-2.5 h-2.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8 9l-4 3 4 3m8-6l4 3-4 3" /></svg>
                                                            </span>
                                                        )}
                                                        {setNum && (
                                                            <span className="absolute -bottom-1 -left-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center shadow-sm">
                                                                S{setNum}
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-6 space-y-3">
                                <div className="flex items-center gap-3 text-sm text-gray-600">
                                    <div className="w-4 h-4 rounded bg-green-100 border border-green-200"></div>
                                    <span>Answered</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-gray-600">
                                    <div className="w-4 h-4 rounded bg-yellow-100 border border-yellow-200 ring-1 ring-yellow-300"></div>
                                    <span>Marked for Review</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-gray-600">
                                    <div className="w-4 h-4 rounded bg-gray-50 border border-gray-100"></div>
                                    <span>Not Visited</span>
                                </div>
                            </div>

                            <Button
                                onClick={() => { setShowMobileNav(false); setShowSubmitConfirm(true); }}
                                disabled={submitting}
                                size="sm"
                                className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 text-white"
                            >
                                Submit Test
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Fullscreen Code Editor Overlay */}
            {editorSize === 'fullscreen' && currentQuestion?.type === 'code' && (
                <div className="fixed inset-0 z-[60] bg-white flex flex-col" role="dialog" aria-modal="true" aria-label="Maximized code editor">
                    {/* Top bar */}
                    <div className="flex items-center justify-between px-4 py-2.5 border-b bg-white shrink-0">
                        <div className="flex items-center gap-3 min-w-0">
                            <h2 className="text-sm font-bold text-gray-900 truncate">
                                Q{currentQuestionIndex + 1}: Code Editor
                            </h2>
                            <span className="hidden sm:inline-flex bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full text-xs font-medium">
                                {currentQuestion.marks} Marks
                            </span>
                            <div className={`hidden md:flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium`} aria-live="polite">
                                {saveStatus === 'saving' ? (
                                    <><span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span><span className="text-gray-500">Saving...</span></>
                                ) : saveStatus === 'error' ? (
                                    <><span className="w-2 h-2 bg-red-500 rounded-full"></span><span className="text-red-600">Save failed</span></>
                                ) : lastSavedAt ? (
                                    <><svg className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg><span className="text-gray-500">Auto-saved</span></>
                                ) : null}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`font-mono text-sm font-bold ${getTimerColor()}`}>{formatTime(timeLeft)}</span>
                            <select
                                value={editorDrafts[currentQuestion.id]?.language || currentQuestion.supportedLanguages?.[0] || 'python'}
                                onChange={(e) => {
                                    const lang = e.target.value as CodeLanguage;
                                    const starter = currentQuestion.starters?.find(s => s.language === lang);
                                    setEditorDrafts(prev => ({
                                        ...prev,
                                        [currentQuestion.id]: { code: starter?.code || '', language: lang }
                                    }));
                                }}
                                className="px-2 py-1 border border-gray-300 rounded text-xs"
                                aria-label="Language"
                            >
                                {currentQuestion.supportedLanguages?.map(lang => (
                                    <option key={lang} value={lang}>
                                        {lang === 'cpp' ? 'C++' : lang.charAt(0).toUpperCase() + lang.slice(1)}
                                    </option>
                                ))}
                            </select>
                            <div className="hidden sm:flex items-center bg-gray-100 rounded p-0.5">
                                <button onClick={() => setEditorFontSize(s => Math.max(10, s - 1))} className="px-1.5 text-xs font-bold text-gray-600 hover:text-gray-900" aria-label="Decrease font size">A-</button>
                                <span className="px-1 text-xs font-mono text-gray-500 tabular-nums">{editorFontSize}</span>
                                <button onClick={() => setEditorFontSize(s => Math.min(28, s + 1))} className="px-1.5 text-xs font-bold text-gray-600 hover:text-gray-900" aria-label="Increase font size">A+</button>
                            </div>
                            <button
                                onClick={() => setEditorTheme(t => t === 'vs-light' ? 'vs-dark' : 'vs-light')}
                                className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
                                aria-label="Toggle theme"
                                title="Toggle theme"
                            >
                                {editorTheme === 'vs-light' ? (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                                ) : (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                )}
                            </button>
                            <Button
                                onClick={() => runCode(currentQuestion)}
                                disabled={runningCode || !(editorDrafts[currentQuestion.id]?.code?.trim())}
                                size="sm"
                                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                            >
                                {runningCode ? 'Running...' : 'Run Code'}
                            </Button>
                            <button
                                onClick={() => setEditorSize('normal')}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 text-xs font-bold"
                                title="Exit fullscreen (Esc)"
                                aria-label="Exit fullscreen"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path d="M4 8V4m0 0h4M20 8V4m0 0h-4M4 16v4m0 0h4M20 16v4m0 0h-4"/>
                                </svg>
                                Exit
                            </button>
                        </div>
                    </div>

                    {/* Split content: 3 panels — resizable on lg+ */}
                    <div ref={fullscreenSplitRef} className="flex-1 flex flex-col lg:flex-row min-h-0">
                        {/* Left: Problem Statement */}
                        <aside
                            className="w-full lg:flex-shrink-0 border-b lg:border-b-0 lg:border-r bg-gray-50 overflow-y-auto p-5 max-h-[35vh] lg:max-h-none"
                            style={isLgUp ? { width: `${problemPaneSize}%`, flexBasis: `${problemPaneSize}%` } : undefined}
                        >
                            <div>
                                <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Problem Statement</span>
                                <FormattedContent
                                    html={currentQuestion.questionText}
                                    size="base"
                                    className="text-gray-800 mt-2"
                                />
                            </div>
                        </aside>

                        {/* Drag handle: problem | editor */}
                        <div
                            onPointerDown={startPaneDrag('left')}
                            className="hidden lg:flex items-center justify-center w-1.5 cursor-col-resize bg-gray-100 hover:bg-indigo-200 active:bg-indigo-400 transition-colors group"
                            role="separator"
                            aria-orientation="vertical"
                            aria-label="Resize problem panel"
                            title="Drag to resize"
                        >
                            <div className="w-0.5 h-8 bg-gray-300 group-hover:bg-indigo-500 rounded-full" />
                        </div>

                        {/* Center: Editor */}
                        <div className="flex-1 min-h-0 min-w-0">
                            <Editor
                                height="100%"
                                language={LANGUAGE_MAP[editorDrafts[currentQuestion.id]?.language || currentQuestion.supportedLanguages?.[0] || 'python']}
                                value={editorDrafts[currentQuestion.id]?.code || ''}
                                onChange={(value) => {
                                    const lang = editorDrafts[currentQuestion.id]?.language || currentQuestion.supportedLanguages?.[0] || 'python';
                                    setEditorDrafts(prev => ({
                                        ...prev,
                                        [currentQuestion.id]: { code: value || '', language: lang }
                                    }));
                                }}
                                theme={editorTheme}
                                onMount={handleEditorMount}
                                options={{
                                    minimap: { enabled: true },
                                    fontSize: editorFontSize,
                                    scrollBeyondLastLine: false,
                                    automaticLayout: true,
                                    wordWrap: 'on',
                                    contextmenu: false,
                                }}
                                loading={<div className="h-full flex items-center justify-center text-gray-400">Loading editor...</div>}
                            />
                        </div>

                        {/* Drag handle: editor | results (only when right panel is open and on lg+) */}
                        {isRightPanelOpen && (
                            <div
                                onPointerDown={startPaneDrag('right')}
                                className="hidden lg:flex items-center justify-center w-1.5 cursor-col-resize bg-gray-100 hover:bg-indigo-200 active:bg-indigo-400 transition-colors group"
                                role="separator"
                                aria-orientation="vertical"
                                aria-label="Resize results panel"
                                title="Drag to resize"
                            >
                                <div className="w-0.5 h-8 bg-gray-300 group-hover:bg-indigo-500 rounded-full" />
                            </div>
                        )}

                        {/* Right: Test Cases + Console + Results (collapsible) */}
                        <aside
                            className="hidden lg:flex lg:flex-shrink-0 border-t lg:border-t-0 lg:border-l bg-white flex-col max-h-[35vh] lg:max-h-none"
                            style={
                                isLgUp
                                    ? isRightPanelOpen
                                        ? { width: `${resultsPaneSize}%`, flexBasis: `${resultsPaneSize}%` }
                                        : { width: '2.75rem', flexBasis: '2.75rem' }
                                    : undefined
                            }
                        >
                            {/* Header with collapse/expand toggle */}
                            <div className="flex items-center border-b bg-gray-50 shrink-0">
                                {isRightPanelOpen && (
                                    <span className="flex-1 px-3 py-2.5 text-xs font-bold text-indigo-700 border-b-2 border-indigo-600 bg-white truncate">Test Cases</span>
                                )}
                                <button
                                    onClick={() => setIsRightPanelOpen(v => !v)}
                                    className={`p-2.5 text-gray-500 hover:text-indigo-700 hover:bg-indigo-50 shrink-0 ${isRightPanelOpen ? '' : 'w-full flex items-center justify-center'}`}
                                    title={isRightPanelOpen ? 'Collapse panel' : 'Expand panel'}
                                >
                                    {isRightPanelOpen ? (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
                                    )}
                                </button>
                            </div>

                            {/* Panel content — only when expanded */}
                            {isRightPanelOpen && (
                                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                    {/* Test Cases */}
                                    {currentQuestion.testCases && currentQuestion.testCases.filter(tc => !tc.isHidden).length > 0 && (
                                        <div>
                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Sample Cases</span>
                                            <div className="mt-2 space-y-2">
                                                {currentQuestion.testCases.filter(tc => !tc.isHidden).map((tc, idx) => (
                                                    <div key={idx} className="bg-gray-50 rounded-lg border border-gray-200 p-2.5 text-[11px] font-mono space-y-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded">Case {idx + 1}</span>
                                                        </div>
                                                        <div><span className="text-gray-400">In:</span> <span className="text-gray-700 whitespace-pre-wrap">{tc.input || '(empty)'}</span></div>
                                                        <div><span className="text-gray-400">Exp:</span> <span className="text-gray-700 whitespace-pre-wrap">{tc.expectedOutput || '(empty)'}</span></div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Console Output */}
                                    {codeConsoleOutput[currentQuestion.id] && (
                                        <div>
                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Console</span>
                                            <div className="mt-2 bg-gray-900 rounded-lg p-3 text-[11px] font-mono space-y-2">
                                                {codeConsoleOutput[currentQuestion.id].compileOutput && (
                                                    <div className="text-amber-400 whitespace-pre-wrap">{codeConsoleOutput[currentQuestion.id].compileOutput}</div>
                                                )}
                                                {codeConsoleOutput[currentQuestion.id].stdout && (
                                                    <div className="text-green-400 whitespace-pre-wrap">{codeConsoleOutput[currentQuestion.id].stdout}</div>
                                                )}
                                                {codeConsoleOutput[currentQuestion.id].stderr && (
                                                    <div className="text-red-400 whitespace-pre-wrap">{codeConsoleOutput[currentQuestion.id].stderr}</div>
                                                )}
                                                {!codeConsoleOutput[currentQuestion.id].stdout && !codeConsoleOutput[currentQuestion.id].stderr && !codeConsoleOutput[currentQuestion.id].compileOutput && (
                                                    <div className="text-gray-500 italic">No output</div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Run Results */}
                                    {testCaseResults[currentQuestion.id] && (
                                        <div>
                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Results</span>
                                            <div className="mt-2 space-y-2">
                                                {testCaseResults[currentQuestion.id].map((result, idx) => (
                                                    <div key={idx} className={`p-2.5 rounded-lg border text-[11px] ${result.passed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="font-bold">{result.isHidden ? 'Hidden' : `Case ${idx + 1}`}</span>
                                                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${result.passed ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                                                                {result.passed ? 'Passed' : 'Failed'}
                                                            </span>
                                                        </div>
                                                        {!result.isHidden && (
                                                            <div className="space-y-0.5 font-mono">
                                                                <div><span className="text-gray-500">Expected:</span> <span className="text-gray-700 whitespace-pre-wrap">{result.expectedOutput || '(empty)'}</span></div>
                                                                <div><span className="text-gray-500">Actual:</span> <span className={`${result.passed ? 'text-green-700' : 'text-red-700'} whitespace-pre-wrap`}>{result.actualOutput || '(empty)'}</span></div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </aside>
                    </div>

                    {/* Footer hint */}
                    <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-500 flex items-center justify-between shrink-0">
                        <span>Press <kbd className="px-1.5 py-0.5 bg-gray-200 rounded font-mono text-[10px]">Esc</kbd> to exit fullscreen</span>
                        <span className="hidden sm:inline">Your code is auto-saved continuously</span>
                    </div>
                </div>
            )}

            {/* Submit Confirmation / Review Modal */}
            {showSubmitConfirm && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="submit-title">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !submitting && setShowSubmitConfirm(false)} />
                    <Card className="relative max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl">
                        <div className="p-6 border-b border-gray-100 flex items-start gap-4">
                            <div className="w-12 h-12 shrink-0 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 id="submit-title" className="text-xl font-bold text-gray-900">Review &amp; Submit</h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    Once submitted, your answers cannot be changed. Take a moment to review any
                                    unanswered or flagged questions below.
                                </p>
                            </div>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-5">
                            {/* Summary tiles */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Answered</div>
                                    <div className="text-2xl font-bold text-emerald-900 mt-0.5">{answeredCount}</div>
                                </div>
                                <div className={`p-3 rounded-lg border ${unansweredIndexes.length ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-200'}`}>
                                    <div className={`text-[10px] font-bold uppercase tracking-wider ${unansweredIndexes.length ? 'text-orange-700' : 'text-gray-500'}`}>Unanswered</div>
                                    <div className={`text-2xl font-bold mt-0.5 ${unansweredIndexes.length ? 'text-orange-900' : 'text-gray-700'}`}>{unansweredIndexes.length}</div>
                                </div>
                                <div className={`p-3 rounded-lg border ${flaggedIndexes.length ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'}`}>
                                    <div className={`text-[10px] font-bold uppercase tracking-wider ${flaggedIndexes.length ? 'text-yellow-700' : 'text-gray-500'}`}>Flagged</div>
                                    <div className={`text-2xl font-bold mt-0.5 ${flaggedIndexes.length ? 'text-yellow-800' : 'text-gray-700'}`}>{flaggedIndexes.length}</div>
                                </div>
                                <div className={`p-3 rounded-lg border ${timeLeft < 300 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                                    <div className={`text-[10px] font-bold uppercase tracking-wider ${timeLeft < 300 ? 'text-red-700' : 'text-gray-500'}`}>Time Left</div>
                                    <div className={`text-2xl font-bold mt-0.5 font-mono tabular-nums ${timeLeft < 300 ? 'text-red-900' : 'text-gray-700'}`}>{formatTime(timeLeft)}</div>
                                </div>
                            </div>

                            {/* Unanswered list */}
                            {unansweredIndexes.length > 0 && (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-orange-500" />
                                            Unanswered questions ({unansweredIndexes.length})
                                        </h4>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {unansweredIndexes.map((i) => (
                                            <button
                                                key={i}
                                                type="button"
                                                onClick={() => { setShowSubmitConfirm(false); goToQuestion(i); }}
                                                className="w-9 h-9 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 text-sm font-bold transition-colors"
                                                title={`Jump to Q${i + 1}`}
                                            >
                                                {i + 1}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Flagged list */}
                            {flaggedIndexes.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-2">
                                        <span className="w-2 h-2 rounded-full bg-yellow-500" />
                                        Flagged for review ({flaggedIndexes.length})
                                    </h4>
                                    <div className="flex flex-wrap gap-1.5">
                                        {flaggedIndexes.map((i) => (
                                            <button
                                                key={i}
                                                type="button"
                                                onClick={() => { setShowSubmitConfirm(false); goToQuestion(i); }}
                                                className="w-9 h-9 rounded-lg bg-yellow-50 hover:bg-yellow-100 text-yellow-800 border border-yellow-200 text-sm font-bold transition-colors"
                                                title={`Jump to Q${i + 1}`}
                                            >
                                                {i + 1}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* All-clear message */}
                            {unansweredIndexes.length === 0 && flaggedIndexes.length === 0 && (
                                <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-3">
                                    <svg className="w-6 h-6 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <div className="text-sm text-emerald-800">
                                        <span className="font-bold">All set.</span> You&apos;ve answered every question and have nothing flagged for review.
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-gray-100 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
                            <Button
                                variant="outline"
                                onClick={() => setShowSubmitConfirm(false)}
                                disabled={submitting}
                                className="sm:flex-none"
                            >
                                Continue Test
                            </Button>
                            <Button
                                onClick={() => { setShowSubmitConfirm(false); finishTest(); }}
                                disabled={submitting}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white sm:flex-none sm:min-w-[180px]"
                            >
                                {submitting ? 'Submitting...' : 'Submit Test'}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {submitError && !submitting && (
                <div className="fixed left-4 right-4 bottom-4 z-[110] sm:left-auto sm:right-6 sm:max-w-md">
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-lg" role="alert">
                        <div className="flex items-start gap-3">
                            <svg className="mt-0.5 h-5 w-5 shrink-0 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            </svg>
                            <div>
                                <div className="font-semibold">Submission failed</div>
                                <div className="mt-0.5">{submitError}</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Submitting overlay — blocks all interaction while finishing the attempt */}
            {submitting && (
                <div className="fixed inset-0 z-[120] bg-gray-900/85 backdrop-blur-sm flex items-center justify-center p-6" role="status" aria-live="polite">
                    <div className="text-center text-white max-w-md">
                        <div className="relative w-20 h-20 mx-auto mb-6">
                            <div className="absolute inset-0 rounded-full border-4 border-white/20"></div>
                            <div className="absolute inset-0 rounded-full border-4 border-t-indigo-400 border-r-transparent border-b-transparent border-l-transparent animate-spin"></div>
                        </div>
                        <h2 className="text-xl font-bold text-white">Submitting your test...</h2>
                        <p className="text-sm text-white/70 mt-2">
                            Please don&apos;t close this tab. We&apos;re saving your answers and calculating your results.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
