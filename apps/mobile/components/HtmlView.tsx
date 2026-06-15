/**
 * Minimal HTML reader for problem statements & explanations — renders the
 * subset the content actually uses (paragraphs, lists, code, bold/italic,
 * <pre> blocks) as native Text. Deliberately not a full HTML engine: keeps
 * us off heavyweight/aging webview-style deps for what is 95% prose.
 */
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/lib/theme";

type Inline = { text: string; code?: boolean; bold?: boolean };
type Block = { type: "p" | "pre" | "li"; inlines: Inline[] };

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Parse inline-level markup (code/bold) inside one block of HTML. */
function parseInlines(html: string): Inline[] {
  const out: Inline[] = [];
  // Tokenize on <code>/<strong>/<b> spans; everything else is stripped.
  const re = /<(code|strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  const plain = (s: string) => {
    const t = decodeEntities(s.replace(/<[^>]+>/g, ""));
    if (t) out.push({ text: t });
  };
  while ((m = re.exec(html))) {
    plain(html.slice(last, m.index));
    const inner = decodeEntities(m[2].replace(/<[^>]+>/g, ""));
    if (inner) out.push({ text: inner, code: m[1].toLowerCase() === "code", bold: m[1].toLowerCase() !== "code" });
    last = m.index + m[0].length;
  }
  plain(html.slice(last));
  return out;
}

function parseBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  // Pull out <pre> blocks first — their content is verbatim.
  const parts = html.split(/(<pre\b[^>]*>[\s\S]*?<\/pre>)/gi);
  for (const part of parts) {
    if (!part.trim()) continue;
    if (/^<pre/i.test(part)) {
      const inner = part.replace(/^<pre\b[^>]*>/i, "").replace(/<\/pre>$/i, "");
      const text = decodeEntities(inner.replace(/<[^>]+>/g, "")).replace(/^\n+|\n+$/g, "");
      if (text) blocks.push({ type: "pre", inlines: [{ text }] });
      continue;
    }
    // Split prose into paragraph-ish chunks on block-level boundaries.
    const chunks = part
      .replace(/<br\s*\/?>/gi, "\n")
      .split(/<\/(?:p|div|h[1-6]|ul|ol)>|<li\b[^>]*>/gi);
    for (const raw of chunks) {
      const isLi = /<\/li>/i.test(raw) || false;
      const cleaned = raw.replace(/<\/li>/gi, "");
      const inlines = parseInlines(cleaned);
      const text = inlines.map((i) => i.text).join("").trim();
      if (!text) continue;
      blocks.push({ type: isLi ? "li" : "p", inlines });
    }
  }
  return blocks;
}

export function HtmlView({ html }: { html: string }) {
  if (!html) return null;
  const blocks = parseBlocks(html);
  return (
    <View style={{ gap: spacing(2.5) }}>
      {blocks.map((b, i) => {
        if (b.type === "pre") {
          return (
            <View key={i} style={styles.pre}>
              <Text style={styles.preText}>{b.inlines[0]?.text}</Text>
            </View>
          );
        }
        return (
          <Text key={i} style={styles.p}>
            {b.type === "li" ? "•  " : ""}
            {b.inlines.map((inl, j) => (
              <Text
                key={j}
                style={[
                  inl.code ? styles.inlineCode : null,
                  inl.bold ? styles.bold : null,
                ]}
              >
                {inl.text.replace(/\s+/g, (s) => (s.includes("\n") ? "\n" : " "))}
              </Text>
            ))}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  p: { fontSize: 14.5, lineHeight: 22, color: colors.inkSoft },
  bold: { fontWeight: "700", color: colors.ink },
  inlineCode: {
    fontFamily: "monospace",
    fontSize: 13,
    color: colors.primaryDark,
    backgroundColor: colors.primaryTint,
  },
  pre: {
    backgroundColor: colors.heroPanel,
    borderRadius: radius.md,
    padding: spacing(3),
  },
  preText: { fontFamily: "monospace", fontSize: 12.5, lineHeight: 18, color: "#e2e8f0" },
});
