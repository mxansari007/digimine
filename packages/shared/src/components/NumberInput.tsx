"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

export interface NumberInputProps
    extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
    /** Current numeric value, or null/undefined when the field is unset. */
    value: number | null | undefined;
    /** Called with the parsed number, or null when the field is empty. */
    onValueChange: (value: number | null) => void;
}

/**
 * A number input that behaves like a real text field.
 *
 * The naive `<input type="number" value={n} onChange={e => set(Number(e.target.value) || 0)} />`
 * has three long-standing bugs:
 *   - You can't clear it — deleting the digit snaps it straight back to "0".
 *   - A leading "0" is sticky, so you end up typing "025".
 *   - `|| 0` swallows a real 0 and fights decimal entry.
 *
 * This component fixes all three by keeping a local string "draft" while the
 * user types and only reporting a parsed number (or `null` when empty) to the
 * parent. The parent should store that value as `number | null` and coerce it
 * (`?? 0`, `?? undefined`, …) at submit time — never feed a coerced 0 back in
 * as `value`, or the empty field would refill.
 */
export function NumberInput({ value, onValueChange, onBlur, ...rest }: NumberInputProps) {
    const [draft, setDraft] = useState(() => (value == null ? "" : String(value)));
    // The last value WE emitted, so an external change to `value` (initialData,
    // a programmatic reset) can be told apart from our own echo — adopting the
    // former while never clobbering an in-progress draft for the latter.
    const lastEmitted = useRef<number | null>(value ?? null);

    useEffect(() => {
        const next = value ?? null;
        if (next !== lastEmitted.current) {
            setDraft(next == null ? "" : String(next));
            lastEmitted.current = next;
        }
    }, [value]);

    const handleChange = (raw: string) => {
        setDraft(raw);
        const parsed = raw.trim() === "" ? null : Number(raw);
        // Ignore transient invalid states (e.g. "-" or "1e") — keep the draft
        // on screen but don't emit NaN to the parent.
        if (parsed === null || !Number.isNaN(parsed)) {
            lastEmitted.current = parsed;
            onValueChange(parsed);
        }
    };

    return (
        <input
            {...rest}
            type="number"
            value={draft}
            onChange={(event) => handleChange(event.target.value)}
            onBlur={(event) => {
                // Canonicalise the visible text on blur ("007" → "7"; "" stays "").
                if (draft.trim() !== "") {
                    const n = Number(draft);
                    if (!Number.isNaN(n)) setDraft(String(n));
                }
                onBlur?.(event);
            }}
        />
    );
}
