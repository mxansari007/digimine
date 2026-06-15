/**
 * Per-source presentation for the job map "layers" — color + label.
 * Kept free of leaflet/react imports so BOTH the map (client-only) and the
 * page (which legend/toggles layers) can import it without pulling Leaflet
 * into the server bundle.
 */
export const SOURCE_META: Record<string, { label: string; color: string }> = {
    internal: { label: "Posted by us", color: "#f59e0b" }, // amber
    adzuna: { label: "Adzuna", color: "#2dd4bf" }, // teal
    remotive: { label: "Remotive", color: "#818cf8" }, // indigo
    jobicy: { label: "Jobicy", color: "#f472b6" }, // rose — global remote
};

export const sourceColor = (s: string) => SOURCE_META[s]?.color ?? "#2dd4bf";
export const sourceLabel = (s: string) => SOURCE_META[s]?.label ?? s;
