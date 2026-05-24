"use client";

/**
 * Sticky toolbar that appears at the top of a list page when the user has
 * selected one or more rows via the bulk-selection hook. Renders nothing
 * when count === 0, so call sites drop it in unconditionally.
 *
 *   <BulkActionsBar
 *       count={sel.count}
 *       onClear={sel.clear}
 *       onDelete={async () => await bulkDelete(sel.ids)}
 *       label="problems"
 *   />
 */
import { useState } from "react";
import { Button } from "@digimine/ui";

interface Props {
    count: number;
    onClear: () => void;
    /** Returns when the delete finishes — bar shows a busy state during. */
    onDelete: () => Promise<void> | void;
    /** What to call the things being deleted in copy ("problems", "topics"). */
    label: string;
    /** Optional extra actions to render alongside Delete (e.g. Publish, Archive). */
    extras?: React.ReactNode;
}

export function BulkActionsBar({ count, onClear, onDelete, label, extras }: Props) {
    const [busy, setBusy] = useState(false);
    if (count === 0) return null;

    const handleDelete = async () => {
        if (
            !confirm(
                `Delete ${count} selected ${label}? This cannot be undone.`
            )
        )
            return;
        setBusy(true);
        try {
            await onDelete();
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="sticky top-16 z-30 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary-200 bg-primary-50/80 px-4 py-2 shadow-sm backdrop-blur">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary-900">
                <span className="rounded-full bg-primary-600 px-2 py-0.5 text-xs font-bold text-white">
                    {count}
                </span>
                <span>
                    selected · {label}
                    {count === 1 ? "" : "s"}
                </span>
            </div>
            <div className="flex items-center gap-2">
                {extras}
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={onClear}
                    disabled={busy}
                    className="!text-slate-700"
                >
                    Clear
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    isLoading={busy}
                    onClick={handleDelete}
                    className="!text-rose-700 hover:!bg-rose-50"
                >
                    Delete selected
                </Button>
            </div>
        </div>
    );
}
