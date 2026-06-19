"use client";

import { useEffect, useRef, useState } from "react";
import { auth } from "@/lib/firebase/client";

/**
 * LabAgentConnect — the STUDENT's "connect my desktop" panel.
 *
 * Remote help (the teacher viewing/controlling the student's actual machine)
 * needs the installable Lab Agent, which can't share the student's web login. So
 * the student generates a short-lived PAIRING CODE here and types it into the
 * agent; the agent redeems it (POST /api/lab/agent/pair) for a session-scoped
 * LiveKit token and joins the room as the student's desktop. Nothing is shared
 * or controlled without the student's explicit action in the agent.
 */
export function LabAgentConnect({
    sessionId,
    forceOpen = false,
    askSignal = null,
}: {
    sessionId: string;
    /** Open the panel + generate a code automatically (e.g. when the teacher asks). */
    forceOpen?: boolean;
    /**
     * Identity of the CURRENT teacher control-ask, or null when there's none. The
     * hook hands a FRESH object on every new ask, so its reference doubles as a
     * nonce: a second ask re-opens the panel even after the student closed it (and
     * even from the same teacher), where keying on `forceOpen`'s rising edge alone
     * would miss it.
     */
    askSignal?: object | null;
}) {
    const [open, setOpen] = useState(false);
    const [code, setCode] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const generate = async () => {
        setBusy(true);
        setError(null);
        try {
            const user = auth.currentUser;
            if (!user) throw new Error("You must be signed in.");
            const idToken = await user.getIdToken();
            const res = await fetch("/api/lab/agent/pairing-code", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ sessionId }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Couldn't create a pairing code.");
            setCode(data.code as string);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't create a pairing code.");
        } finally {
            setBusy(false);
        }
    };

    const onOpen = () => {
        setOpen(true);
        if (!code) void generate();
    };

    // Auto-open + generate a code when the teacher asks for remote control. We key
    // on the ask's IDENTITY (a fresh object per ask), not `forceOpen`'s rising
    // edge, so a SECOND ask re-opens the panel even after the student closed it.
    // `forceOpen` is still honoured for the initial open / when no signal is wired.
    const lastAskRef = useRef<object | null>(null);
    useEffect(() => {
        if (askSignal != null) {
            if (askSignal !== lastAskRef.current) {
                lastAskRef.current = askSignal;
                onOpen();
            }
        } else if (forceOpen) {
            onOpen();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [forceOpen, askSignal]);

    // Reset to copy-button state after a moment; keep a ref so we can cancel a
    // pending reset on unmount (no setState-after-unmount).
    const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
        () => () => {
            if (copyResetRef.current != null) clearTimeout(copyResetRef.current);
        },
        []
    );

    const copy = () => {
        if (!code) return;
        // Only show "Copied" when the write actually succeeds — in insecure
        // contexts `writeText` rejects, and we must not claim success then.
        navigator.clipboard
            .writeText(code)
            .then(() => {
                setCopied(true);
                if (copyResetRef.current != null) clearTimeout(copyResetRef.current);
                copyResetRef.current = setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => {
                /* clipboard blocked (insecure context / denied) — leave state as-is */
            });
    };

    if (!open) {
        return (
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-soft-sm dark:border-slate-700 dark:bg-surface">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">Let your teacher help on your computer</p>
                        <p className="text-[11px] text-slate-500">
                            Connect the desktop agent so your teacher can view — and, only if you allow it, control — your machine.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onOpen}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white shadow-glow-primary transition-colors hover:bg-primary-700"
                    >
                        <DesktopIcon className="h-4 w-4" />
                        Connect my desktop
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft-sm dark:border-slate-700 dark:bg-surface">
            <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                    <p className="text-sm font-semibold text-gray-900">Connect your desktop</p>
                    <p className="text-[11px] text-slate-500">
                        Open the <span className="font-medium">PlacementRanker Lab Agent</span> app and pair it with this code.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700/60"
                >
                    Close
                </button>
            </div>

            {/* The code */}
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-primary-300 bg-primary-50/60 px-3 py-3 dark:border-primary-500/40 dark:bg-primary-500/10">
                {busy && !code ? (
                    <span className="font-mono text-lg text-slate-400">Generating…</span>
                ) : code ? (
                    <span className="select-all font-mono text-2xl font-bold tracking-widest text-primary-800 dark:text-primary-200">
                        {code}
                    </span>
                ) : (
                    <span className="font-mono text-lg text-slate-400">——— ———</span>
                )}
                {code && (
                    <button
                        type="button"
                        onClick={copy}
                        className="ml-auto shrink-0 rounded-lg border border-primary-200 px-2.5 py-1.5 text-[11px] font-semibold text-primary-700 transition-colors hover:bg-primary-100 dark:border-primary-500/30 dark:text-primary-300 dark:hover:bg-primary-500/15"
                    >
                        {copied ? "Copied" : "Copy"}
                    </button>
                )}
            </div>

            {error && (
                <p role="alert" className="mt-2 text-[11px] font-medium text-danger-600 dark:text-danger-400">
                    {error}
                </p>
            )}

            {/* Steps */}
            <ol className="mt-3 space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                <Step n={1}>Open the <span className="font-medium">PlacementRanker Lab Agent</span> app on this computer.</Step>
                <Step n={2}>Paste the code above into <span className="font-medium">Pairing code</span> → <span className="font-medium">Pair this device</span>.</Step>
                <Step n={3}>Click <span className="font-medium">Share my screen</span> in the agent.</Step>
                <Step n={4}>Your teacher can then view your desktop, and control it <span className="font-medium">only after you tap Allow</span> in the agent.</Step>
            </ol>

            <div className="mt-3 flex items-center gap-2">
                <button
                    type="button"
                    onClick={generate}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/60"
                >
                    {busy ? "Generating…" : "New code"}
                </button>
                <span className="text-[10px] text-slate-400">Codes expire after 10 minutes and can be used once.</span>
            </div>
        </div>
    );
}

export default LabAgentConnect;

function Step({ n, children }: { n: number; children: React.ReactNode }) {
    return (
        <li className="flex items-start gap-2">
            <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[9px] font-bold text-primary-700 dark:bg-primary-500/20 dark:text-primary-300">
                {n}
            </span>
            <span className="min-w-0">{children}</span>
        </li>
    );
}

function DesktopIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <rect x="3" y="4" width="18" height="12" rx="2" strokeWidth={2} />
            <path strokeLinecap="round" strokeWidth={2} d="M8 20h8M12 16v4" />
        </svg>
    );
}
