import { Linking, View } from "react-native";
import type { JobOpening } from "@/lib/api";
import { radius, space } from "@/design/tokens";
import { Button, Icon, PressableScale, Text } from "@/design/ui";
import { sourceLabel } from "./sourceMeta";

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const days = Math.floor(Math.max(0, Date.now() - t) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const d = new Date(t);
  return `${d.getDate()} ${MONTH[d.getMonth()]}`;
}

function salaryLabel(j: JobOpening): string | null {
  const { salaryMin, salaryMax, salaryCurrency } = j;
  if (salaryMin == null && salaryMax == null) return null;
  const cur = salaryCurrency === "INR" ? "₹" : salaryCurrency ? `${salaryCurrency} ` : "";
  const fmt = (n: number) => (n >= 100000 ? `${(n / 100000).toFixed(1)}L` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`);
  if (salaryMin != null && salaryMax != null) return `${cur}${fmt(salaryMin)}–${fmt(salaryMax)}`;
  return `${cur}${fmt((salaryMin ?? salaryMax) as number)}`;
}

// Tinted pill on the dark map (explicit colors — the console is always dark).
function Pill({ label, tone }: { label: string; tone?: "teal" | "amber" }) {
  const bg = tone === "teal" ? "rgba(45,212,191,0.15)" : tone === "amber" ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.07)";
  const fg = tone === "teal" ? "#5eead4" : tone === "amber" ? "#fcd34d" : "#cbd5e1";
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.full, paddingHorizontal: space[3], paddingVertical: 4 }}>
      <Text variant="caption" style={{ color: fg, fontWeight: "600" }}>
        {label}
      </Text>
    </View>
  );
}

/** Bottom overlay detail card for the tapped marker. Rendered over the map (parent is relative). */
export default function JobSheet({ job, onClose }: { job: JobOpening; onClose: () => void }) {
  const loc =
    [job.location.city, job.location.country].filter(Boolean).join(", ") ||
    job.location.raw ||
    (job.remote ? "Remote" : "—");
  const pay = salaryLabel(job);

  return (
    <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: space[3] }}>
      <View
        style={{
          backgroundColor: "#0f1830",
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
          padding: space[4],
          gap: space[3],
          shadowColor: "#000",
          shadowOpacity: 0.4,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -2 },
          elevation: 8,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space[2] }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="caption" style={{ color: "#5eead4", fontWeight: "700", textTransform: "uppercase" }} numberOfLines={1}>
              {job.company}
            </Text>
            <Text variant="title3" style={{ color: "#fff", marginTop: 2 }} numberOfLines={2}>
              {job.title}
            </Text>
          </View>
          <PressableScale onPress={onClose} scaleTo={0.9} style={{ padding: 4 }}>
            <Icon name="x" size={20} tint="#94a3b8" />
          </PressableScale>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
          <Pill label={`📍 ${loc}`} />
          {job.remote ? <Pill label="Remote" tone="teal" /> : null}
          {job.type ? <Pill label={job.type.replace(/_/g, " ")} /> : null}
          {pay ? <Pill label={pay} tone="amber" /> : null}
        </View>

        {job.descriptionSnippet ? (
          <Text variant="footnote" style={{ color: "rgba(255,255,255,0.78)" }} numberOfLines={3}>
            {job.descriptionSnippet}
          </Text>
        ) : null}

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text variant="caption" style={{ color: "#64748b" }}>
            {[sourceLabel(job.source), timeAgo(job.postedAt)].filter(Boolean).join(" · ")}
          </Text>
        </View>

        <Button label="Apply" fullWidth leftIcon="external-link" onPress={() => Linking.openURL(job.applyUrl).catch(() => {})} />
      </View>
    </View>
  );
}
