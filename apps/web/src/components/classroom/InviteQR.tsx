"use client";

/**
 * Class-invite QR code. Encodes the existing `${origin}/join/<inviteCode>` link
 * so a student can scan it (with the PlacementRanker mobile app's scanner, or
 * any phone camera) and land on the join page — which auto-joins them. Click to
 * blow it up full-screen for projecting to a room.
 */
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

export function InviteQR({
    path,
    title,
    size = 148,
}: {
    /** App-relative join path, e.g. `/join/CLS-XXXX`. The full URL is built from
     *  the current origin client-side. */
    path: string;
    title?: string;
    size?: number;
}) {
    const [open, setOpen] = useState(false);
    const [origin, setOrigin] = useState("");
    useEffect(() => setOrigin(window.location.origin), []);

    // Until mounted (origin known), render a sized placeholder so the layout
    // doesn't jump and there's no SSR/hydration mismatch.
    if (!origin) {
        return (
            <div
                className="animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
                style={{ width: size + 24, height: size + 44 }}
                aria-hidden
            />
        );
    }
    const url = origin + path;

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                title="Enlarge — students scan to join"
                className="group inline-flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-indigo-300 hover:shadow-soft dark:border-slate-700 dark:bg-slate-900"
            >
                <QRCodeSVG value={url} size={size} level="M" marginSize={0} />
                <span className="text-[11px] font-medium text-slate-500 group-hover:text-indigo-600">
                    Tap to enlarge · scan to join
                </span>
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm"
                    onClick={() => setOpen(false)}
                    role="dialog"
                    aria-modal="true"
                >
                    <div
                        className="flex max-w-[92vw] flex-col items-center gap-4 rounded-3xl bg-white p-8 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {title && (
                            <h2 className="text-center text-xl font-bold text-slate-900">{title}</h2>
                        )}
                        <p className="text-center text-sm text-slate-500">
                            Scan with the PlacementRanker app or your phone camera to join.
                        </p>
                        <div className="rounded-2xl border border-slate-200 bg-white p-5">
                            <QRCodeSVG value={url} size={Math.min(380, Math.round(window.innerWidth * 0.7))} level="M" marginSize={0} />
                        </div>
                        <p className="break-all text-center font-mono text-xs text-slate-400">{url}</p>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
