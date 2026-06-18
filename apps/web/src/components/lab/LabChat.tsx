"use client";

import { useEffect, useRef, useState } from "react";
import type { LabChatMessage } from "./useLabRoom";

/**
 * LabChat — the in-room text chat panel.
 *
 * Pure view over the hook's `messages` (oldest first) + a composer that calls
 * `sendChat`. The hook optimistically echoes the local sender, so we never have
 * to track our own lines here. We auto-scroll to the newest message and clear
 * the input on send; the send is fire-and-forget (the hook no-ops until the
 * room is connected), so we don't block the textbox on the await.
 *
 * Presentational + a tiny bit of local input state. No LiveKit, no roster
 * derivation — just `messages` in, `sendChat(text)` out.
 */

export interface LabChatProps {
    messages: LabChatMessage[];
    onSend: (text: string) => Promise<void>;
    /** Disable the composer until the room is live. */
    disabled?: boolean;
    /** Extra classes on the outer panel. */
    className?: string;
}

export function LabChat({ messages, onSend, disabled = false, className = "" }: LabChatProps) {
    const [draft, setDraft] = useState("");
    const listRef = useRef<HTMLDivElement | null>(null);
    const endRef = useRef<HTMLDivElement | null>(null);

    // Keep the newest message in view as the log grows.
    useEffect(() => {
        endRef.current?.scrollIntoView({ block: "end" });
    }, [messages.length]);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const text = draft.trim();
        if (!text || disabled) return;
        setDraft(""); // clear immediately; the hook echoes our own line
        void onSend(text);
    };

    return (
        <div
            className={`flex h-full min-h-[16rem] flex-col rounded-2xl border border-slate-200 bg-white shadow-soft-sm dark:border-slate-700 dark:bg-surface ${className}`}
        >
            <div className="border-b border-slate-200/70 px-4 py-3 dark:border-slate-700/70">
                <h3 className="font-display text-sm font-bold text-gray-900">Chat</h3>
            </div>

            {/* Message log. */}
            <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-3">
                {messages.length === 0 ? (
                    <p className="px-1 py-6 text-center text-xs text-slate-400">
                        No messages yet. Say hello.
                    </p>
                ) : (
                    messages.map((m) => <ChatLine key={m.id} message={m} />)
                )}
                <div ref={endRef} />
            </div>

            {/* Composer. */}
            <form
                onSubmit={submit}
                className="flex items-center gap-2 border-t border-slate-200/70 p-2 dark:border-slate-700/70"
            >
                <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    disabled={disabled}
                    maxLength={500}
                    placeholder={disabled ? "Connecting…" : "Message the room…"}
                    aria-label="Message the room"
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-slate-400 focus:border-primary-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-60 dark:border-slate-600 dark:bg-surface dark:text-slate-100"
                />
                <button
                    type="submit"
                    disabled={disabled || draft.trim().length === 0}
                    aria-label="Send message"
                    className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary-600 px-3 py-2 text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <SendIcon className="h-4 w-4" />
                </button>
            </form>
        </div>
    );
}

export default LabChat;

/** One chat row, right-aligned + tinted when it's your own line. */
function ChatLine({ message }: { message: LabChatMessage }) {
    const { you, fromName, text } = message;
    return (
        <div className={`flex flex-col ${you ? "items-end" : "items-start"}`}>
            {!you && (
                <span className="mb-0.5 px-1 text-[10px] font-semibold text-slate-400">
                    {fromName || "Someone"}
                </span>
            )}
            <span
                className={[
                    "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-xs",
                    you
                        ? "bg-primary-600 text-white"
                        : "bg-slate-100 text-gray-900 dark:bg-slate-700/60 dark:text-slate-100",
                ].join(" ")}
            >
                {text}
            </span>
        </div>
    );
}

function SendIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M13 6l6 6-6 6" />
        </svg>
    );
}
