/**
 * Tiny pub/sub so a SINGLE formatting toolbar (at the top of the editor) can act
 * on whichever rich field is currently focused — a form `RichText` box or an
 * inline editable region on the resume preview. The focused editor registers an
 * `align`/`getAlign` handler; Bold/Italic/Underline are applied with
 * `document.execCommand` on the focused contentEditable, so they don't need the
 * registry. No editor focused → the toolbar is disabled.
 */
export type Align = "left" | "center" | "right" | "justify";

export interface FormatTarget {
    align(a: Align): void;
    getAlign(): Align;
}

let current: FormatTarget | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());

export function setFormatTarget(t: FormatTarget | null): void {
    current = t;
    emit();
}
export function clearFormatTargetIf(t: FormatTarget): void {
    if (current === t) {
        current = null;
        emit();
    }
}
export function getFormatTarget(): FormatTarget | null {
    return current;
}
/** Re-notify subscribers (e.g. after alignment changes) without swapping target. */
export function notifyFormat(): void {
    emit();
}
export function subscribeFormat(cb: () => void): () => void {
    subs.add(cb);
    return () => {
        subs.delete(cb);
    };
}
