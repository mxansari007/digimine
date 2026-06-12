"use client";

/**
 * Direct messages — works for students AND teachers (own shell, no role
 * group). Conversation list on the left, active chat on the right;
 * mobile shows one pane at a time. The open chat polls every 6s with
 * `?after=` so refreshes stay cheap. `?open=<threadId>` deep-links into
 * a conversation (used by "Message" buttons across the classroom).
 */
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import {
    Avatar,
    ConversationRow,
    TeacherBadge,
    timeAgo,
} from "@/components/classroom/community";

type Message = { id: string; senderId: string; text: string; createdAt: string | null };

function MessagesInner() {
    const { firebaseUser, loading: authLoading } = useAuthContext();
    const router = useRouter();
    const searchParams = useSearchParams();
    const openParam = searchParams.get("open");

    const [conversations, setConversations] = useState<ConversationRow[]>([]);
    const [activeId, setActiveId] = useState<string | null>(openParam);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loadingList, setLoadingList] = useState(true);
    const [loadingChat, setLoadingChat] = useState(false);
    const [draft, setDraft] = useState("");
    const [sending, setSending] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const lastAtRef = useRef<string | null>(null);

    const active = conversations.find((c) => c.id === activeId) || null;

    const loadConversations = useCallback(async () => {
        if (!firebaseUser) return;
        try {
            const token = await firebaseUser.getIdToken();
            const res = await fetch("/api/dm", { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            if (res.ok) setConversations(data.conversations || []);
        } finally {
            setLoadingList(false);
        }
    }, [firebaseUser]);

    const loadMessages = useCallback(
        async (threadId: string, incremental: boolean) => {
            if (!firebaseUser) return;
            if (!incremental) {
                setLoadingChat(true);
                lastAtRef.current = null;
            }
            try {
                const token = await firebaseUser.getIdToken();
                const after =
                    incremental && lastAtRef.current
                        ? `?after=${encodeURIComponent(lastAtRef.current)}`
                        : "";
                const res = await fetch(`/api/dm/${threadId}${after}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json();
                if (!res.ok) return;
                const incoming: Message[] = data.messages || [];
                if (incoming.length > 0) {
                    lastAtRef.current = incoming[incoming.length - 1].createdAt;
                    setMessages((prev) => (incremental ? [...prev, ...incoming] : incoming));
                } else if (!incremental) {
                    setMessages([]);
                }
                // Clear the unread badge locally.
                setConversations((prev) =>
                    prev.map((c) => (c.id === threadId ? { ...c, unread: 0 } : c))
                );
            } finally {
                if (!incremental) setLoadingChat(false);
            }
        },
        [firebaseUser]
    );

    useEffect(() => {
        if (authLoading) return;
        if (!firebaseUser) {
            router.push(`/login?redirect=${encodeURIComponent("/messages")}`);
            return;
        }
        loadConversations();
    }, [authLoading, firebaseUser, router, loadConversations]);

    // Open the deep-linked conversation once the list arrives.
    useEffect(() => {
        if (openParam) setActiveId(openParam);
    }, [openParam]);

    useEffect(() => {
        if (!activeId || !firebaseUser) return;
        loadMessages(activeId, false);
        const timer = setInterval(() => loadMessages(activeId, true), 6_000);
        return () => clearInterval(timer);
    }, [activeId, firebaseUser, loadMessages]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages.length]);

    const send = async () => {
        if (!firebaseUser || !activeId || !draft.trim()) return;
        setSending(true);
        const text = draft.trim();
        setDraft("");
        try {
            const token = await firebaseUser.getIdToken();
            const res = await fetch(`/api/dm/${activeId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ text }),
            });
            const data = await res.json();
            if (res.ok) {
                setMessages((prev) => [...prev, data.message]);
                lastAtRef.current = data.message.createdAt;
                loadConversations();
            } else {
                setDraft(text);
            }
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="min-h-screen bg-background px-4 py-8">
            <div className="mx-auto max-w-5xl">
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary-700 focus-visible:underline"
                >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                </Link>
                <h1 className="mt-3 font-display text-2xl font-bold text-gray-900">Messages</h1>
                <p className="mt-1 text-sm text-slate-500">
                    Private conversations with your classmates and teachers.
                </p>

                <div className="mt-6 grid gap-4 lg:grid-cols-[300px,1fr]">
                    {/* Conversation list */}
                    <div className={`${activeId ? "hidden lg:block" : ""}`}>
                        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-surface shadow-soft-sm">
                            {loadingList ? (
                                <div className="space-y-2 p-3">
                                    {[0, 1, 2].map((i) => (
                                        <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-200/60 dark:bg-slate-800" />
                                    ))}
                                </div>
                            ) : conversations.length === 0 ? (
                                <div className="px-5 py-10 text-center">
                                    <p className="text-sm font-medium text-gray-900">No conversations yet</p>
                                    <p className="mt-1 text-xs text-slate-500">
                                        Open a classroom&apos;s People page or any discussion and tap
                                        Message to start one.
                                    </p>
                                </div>
                            ) : (
                                conversations.map((c, i) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => setActiveId(c.id)}
                                        className={`flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors focus:outline-none focus-visible:bg-slate-50 dark:focus-visible:bg-slate-800/40 ${
                                            i > 0 ? "border-t border-slate-100 dark:border-slate-800" : ""
                                        } ${activeId === c.id ? "bg-primary-50/60 dark:bg-primary-500/10" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"}`}
                                    >
                                        <Avatar name={c.otherName} src={c.otherAvatar} />
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-1.5">
                                                <span className="truncate text-sm font-medium text-gray-900">{c.otherName}</span>
                                                {c.otherRole !== "student" && <TeacherBadge />}
                                            </span>
                                            <span className="block truncate text-xs text-slate-500">
                                                {c.lastMessage ? c.lastMessage.text : "Say hello"}
                                            </span>
                                        </span>
                                        <span className="flex shrink-0 flex-col items-end gap-1">
                                            <span className="text-[10px] text-slate-400">
                                                {timeAgo(c.lastMessage?.at ?? c.updatedAt)}
                                            </span>
                                            {c.unread > 0 && (
                                                <span className="rounded-full bg-primary-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                                    {c.unread}
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Chat pane */}
                    <div className={`${!activeId ? "hidden lg:flex" : "flex"} h-[70vh] flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-surface shadow-soft-sm`}>
                        {!active ? (
                            <div className="flex flex-1 items-center justify-center p-8 text-center">
                                <p className="max-w-xs text-sm text-slate-400">
                                    Pick a conversation — or start one from a classroom&apos;s People
                                    page.
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 px-4 py-3">
                                    <button
                                        type="button"
                                        onClick={() => setActiveId(null)}
                                        className="lg:hidden text-slate-400 hover:text-gray-900"
                                        aria-label="Back to conversations"
                                    >
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                        </svg>
                                    </button>
                                    <Avatar name={active.otherName} src={active.otherAvatar} />
                                    <div className="min-w-0">
                                        <p className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                                            {active.otherName}
                                            {active.otherRole !== "student" && <TeacherBadge />}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
                                    {loadingChat ? (
                                        <div className="space-y-2">
                                            {[0, 1, 2].map((i) => (
                                                <div key={i} className={`h-10 w-2/3 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800 ${i % 2 ? "ml-auto" : ""}`} />
                                            ))}
                                        </div>
                                    ) : messages.length === 0 ? (
                                        <p className="pt-10 text-center text-xs text-slate-400">
                                            No messages yet — say hello.
                                        </p>
                                    ) : (
                                        messages.map((m) => {
                                            const mine = m.senderId === firebaseUser?.uid;
                                            return (
                                                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                                                    <div
                                                        className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                                                            mine
                                                                ? "rounded-br-md bg-primary-600 text-white"
                                                                : "rounded-bl-md bg-slate-100 dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                                                        }`}
                                                    >
                                                        <p className="whitespace-pre-wrap break-words">{m.text}</p>
                                                        <p className={`mt-0.5 text-right text-[10px] ${mine ? "text-white/60" : "text-slate-400"}`}>
                                                            {timeAgo(m.createdAt)}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                    <div ref={bottomRef} />
                                </div>

                                <div className="flex gap-2 border-t border-slate-100 dark:border-slate-800 p-3">
                                    <input
                                        className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3.5 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                                        placeholder={`Message ${active.otherName.split(" ")[0]}…`}
                                        value={draft}
                                        onChange={(e) => setDraft(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                send();
                                            }
                                        }}
                                        maxLength={2000}
                                    />
                                    <Button variant="primary" size="sm" onClick={send} disabled={sending || !draft.trim()} className="shrink-0">
                                        Send
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function MessagesPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
            <MessagesInner />
        </Suspense>
    );
}
