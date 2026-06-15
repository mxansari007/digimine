/**
 * Per-source presentation for the mobile job map — mirrors the web's
 * components/jobs/sourceMeta.ts. Used by the layer chips (RN) and passed into
 * the WebView so markers are colored by source.
 */
export const SOURCE_META: Record<string, { label: string; color: string }> = {
  internal: { label: "Posted by us", color: "#f59e0b" }, // amber
  adzuna: { label: "Adzuna", color: "#2dd4bf" }, // teal — India
  jobicy: { label: "Jobicy", color: "#f472b6" }, // rose — global remote
  remotive: { label: "Remotive", color: "#818cf8" }, // indigo — remote
};

export const sourceColor = (s: string) => SOURCE_META[s]?.color ?? "#2dd4bf";
export const sourceLabel = (s: string) => SOURCE_META[s]?.label ?? s;
