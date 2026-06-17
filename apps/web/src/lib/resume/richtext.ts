/**
 * Shared rich-text helpers for the resume editor. The stored value of a
 * formattable field (summary, bullets) is RAW text carrying a tiny allowlist:
 *   • inline: <strong> / <em> / <u> and <br>
 *   • block:  an optional single wrapping <div style="text-align:center|right|justify">
 * Text is escaped only at render time (see `fmtInline` in html.ts). These
 * helpers convert between that string form and a contentEditable DOM, and are
 * used by BOTH the in-form editor (RichText) and the on-resume inline editor
 * (ResumePreview).
 */

const INLINE_TAGS: Record<string, string> = { B: "strong", STRONG: "strong", I: "em", EM: "em", U: "u" };
const ALIGNS = new Set(["center", "right", "justify", "left"]);

/** Walk an edited contentEditable node → the stored string form (raw text +
 *  allowlisted tags). Unknown elements are unwrapped (their text kept). */
export function serializeInline(node: Node): string {
    let out = "";
    node.childNodes.forEach((n) => {
        if (n.nodeType === Node.TEXT_NODE) {
            out += n.textContent ?? "";
            return;
        }
        if (n.nodeType !== Node.ELEMENT_NODE) return;
        const el = n as HTMLElement;
        if (el.tagName === "BR") {
            out += "<br>";
            return;
        }
        const tag = INLINE_TAGS[el.tagName];
        if (tag) {
            out += `<${tag}>${serializeInline(el)}</${tag}>`;
            return;
        }
        if (el.tagName === "DIV") {
            const a = (el.style.textAlign || "").toLowerCase();
            const inner = serializeInline(el);
            out += a && ALIGNS.has(a) && a !== "left" ? `<div style="text-align:${a}">${inner}</div>` : inner;
            return;
        }
        out += serializeInline(el); // unwrap anything else, keep its text
    });
    return out;
}

/** Split a stored value into its block alignment + inner (inline-only) content. */
export function parseAligned(value: string): { align: "left" | "center" | "right" | "justify"; inner: string } {
    const m = /^<div style="text-align:(center|right|justify)">([\s\S]*)<\/div>$/.exec(value || "");
    return m ? { align: m[1] as "center" | "right" | "justify", inner: m[2] } : { align: "left", inner: value || "" };
}

/** Re-wrap inner content with a block alignment (left = no wrapper). */
export function wrapAligned(inner: string, align: string): string {
    return align && align !== "left" ? `<div style="text-align:${align}">${inner}</div>` : inner;
}
