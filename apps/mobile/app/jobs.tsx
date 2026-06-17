import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Linking, Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { api, type JobOpening } from "@/lib/api";
import { radius, space } from "@/design/tokens";
import { Text } from "@/design/ui";
import JobMapWeb from "@/components/jobs/JobMapWeb";
import JobSheet from "@/components/jobs/JobSheet";
import { SOURCE_META, sourceLabel } from "@/components/jobs/sourceMeta";

// Always-dark "intel console" (matches the web /student/jobs), independent of
// app theme — so explicit colors here, not theme tokens.
const BG = "#0b1220";
const PANEL = "rgba(255,255,255,0.05)";
const BORDER = "rgba(255,255,255,0.1)";
const TEAL = "#14b8a6";
const MUTED = "#94a3b8";

const TYPE_FILTERS = [
  { key: "all", label: "All roles" },
  { key: "full_time", label: "Full-time" },
  { key: "internship", label: "Internship" },
  { key: "contract", label: "Contract" },
];
const POSTED_OPTIONS = [
  { key: "all", label: "Any time" },
  { key: "1", label: "24h" },
  { key: "3", label: "3 days" },
  { key: "7", label: "Week" },
  { key: "30", label: "Month" },
];

const locLabel = (j: JobOpening) => j.location.city || j.location.raw || (j.remote ? "Remote" : "—");

export default function JobsScreen() {
  const [jobs, setJobs] = useState<JobOpening[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [postedWithin, setPostedWithin] = useState("all");
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [view, setView] = useState<"map" | "list">("map");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.studentJobs();
      setJobs(Array.isArray(res.jobs) ? res.jobs : []);
    } catch (e: any) {
      setError(e?.message || "Couldn't load job openings.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sources = useMemo(() => Array.from(new Set(jobs.map((j) => j.source))), [jobs]);
  const sourceCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const j of jobs) m[j.source] = (m[j.source] || 0) + 1;
    return m;
  }, [jobs]);
  const toggleSource = (s: string) =>
    setHidden((prev) => {
      const n = new Set(prev);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      return n;
    });

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const cutoff = postedWithin === "all" ? 0 : Date.now() - Number(postedWithin) * 86_400_000;
    return jobs.filter((j) => {
      if (remoteOnly && !j.remote) return false;
      if (hidden.has(j.source)) return false;
      if (typeFilter !== "all" && !(j.type || "").toLowerCase().includes(typeFilter)) return false;
      if (cutoff) {
        const t = j.postedAt ? new Date(j.postedAt).getTime() : NaN;
        if (!Number.isFinite(t) || t < cutoff) return false;
      }
      if (q) {
        const hay = `${j.title} ${j.company} ${j.location.city || ""} ${j.location.raw || ""} ${j.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [jobs, query, typeFilter, remoteOnly, postedWithin, hidden]);

  const stats = useMemo(() => {
    const cities = new Set<string>();
    let remote = 0;
    let mapped = 0;
    for (const j of filtered) {
      if (j.location.city) cities.add(j.location.city);
      if (j.remote) remote++;
      if (j.location.lat != null) mapped++;
    }
    return { total: filtered.length, cities: cities.size, remote, mapped };
  }, [filtered]);

  const selected = useMemo(() => filtered.find((j) => j.id === selectedId) || null, [filtered, selectedId]);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Stats + Map/List toggle */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: space[3], paddingTop: space[3] }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2], flexGrow: 1 }}>
          <Stat n={stats.total} label="jobs" accent />
          <Stat n={stats.cities} label="cities" />
          <Stat n={stats.remote} label="remote" />
        </ScrollView>
        <View style={{ flexDirection: "row", borderRadius: radius.md, borderWidth: 1, borderColor: BORDER, padding: 2 }}>
          {(["map", "list"] as const).map((v) => (
            <Pressable
              key={v}
              onPress={() => setView(v)}
              style={{ paddingHorizontal: space[3], paddingVertical: 5, borderRadius: radius.sm, backgroundColor: view === v ? TEAL : "transparent" }}
            >
              <Text variant="caption" style={{ color: view === v ? "#04241f" : "#cbd5e1", fontWeight: "700", textTransform: "capitalize" }}>
                {v}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Search */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], margin: space[3], paddingHorizontal: space[3], height: 40, borderRadius: radius.full, backgroundColor: PANEL, borderWidth: 1, borderColor: BORDER }}>
        <Feather name="search" size={16} color={MUTED} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search role, company, city…"
          placeholderTextColor={MUTED}
          style={{ flex: 1, color: "#fff", fontSize: 14, padding: 0 }}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: space[2], paddingHorizontal: space[3], alignItems: "center" }}
      >
        {TYPE_FILTERS.map((t) => (
          <Chip key={t.key} label={t.label} active={typeFilter === t.key} onPress={() => setTypeFilter(t.key)} />
        ))}
        <Chip label="Remote" active={remoteOnly} onPress={() => setRemoteOnly((v) => !v)} />
        {POSTED_OPTIONS.map((p) => (
          <Chip key={p.key} label={p.label} active={postedWithin === p.key} onPress={() => setPostedWithin(p.key)} />
        ))}
      </ScrollView>

      {/* Layers (per-source toggles) */}
      {sources.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ gap: space[2], paddingHorizontal: space[3], paddingTop: space[2], alignItems: "center" }}
        >
          <Text variant="caption" style={{ color: "#64748b", alignSelf: "center", textTransform: "uppercase", letterSpacing: 0.6 }}>
            Layers
          </Text>
          {sources.map((s) => {
            const on = !hidden.has(s);
            return (
              <Chip
                key={s}
                label={`${sourceLabel(s)} ${sourceCounts[s] ?? 0}`}
                active={on}
                dot={on ? SOURCE_META[s]?.color ?? "#2dd4bf" : "#475569"}
                onPress={() => toggleSource(s)}
              />
            );
          })}
        </ScrollView>
      ) : null}

      {/* Body */}
      <View style={{ flex: 1, marginTop: space[3] }}>
        {loading ? (
          <Centered text="Loading openings…" />
        ) : error ? (
          <Centered text={error} retry={load} />
        ) : jobs.length === 0 ? (
          <Centered text="No openings yet — check back soon." />
        ) : view === "map" ? (
          <View style={{ flex: 1, position: "relative" }}>
            <JobMapWeb jobs={filtered} onSelect={setSelectedId} />
            {selected ? <JobSheet job={selected} onClose={() => setSelectedId(null)} /> : null}
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(j) => j.id}
            contentContainerStyle={{ padding: space[3], paddingBottom: space[16], gap: space[2] }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  load();
                }}
                tintColor={MUTED}
              />
            }
            renderItem={({ item: j }) => <JobRow job={j} />}
          />
        )}
      </View>
    </View>
  );
}

function Stat({ n, label, accent }: { n: number; label: string; accent?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 5, backgroundColor: PANEL, borderRadius: radius.md, paddingHorizontal: space[3], paddingVertical: 5 }}>
      <Text variant="subhead" style={{ color: accent ? "#5eead4" : "#fff", fontWeight: "800" }}>
        {n}
      </Text>
      <Text variant="caption" style={{ color: MUTED }}>
        {label}
      </Text>
    </View>
  );
}

function Chip({ label, active, onPress, dot }: { label: string; active?: boolean; onPress: () => void; dot?: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: space[3],
        paddingVertical: 7,
        borderRadius: radius.full,
        backgroundColor: active ? TEAL : "rgba(255,255,255,0.06)",
      }}
    >
      {dot ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: dot }} /> : null}
      <Text variant="caption" style={{ color: active ? "#04241f" : "#cbd5e1", fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}

function JobRow({ job: j }: { job: JobOpening }) {
  return (
    <View style={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: radius.lg, borderWidth: 1, borderColor: BORDER, padding: space[4], gap: 6 }}>
      <Text variant="caption" style={{ color: "#5eead4", fontWeight: "700", textTransform: "uppercase" }} numberOfLines={1}>
        {j.company}
      </Text>
      <Text variant="bodyEm" style={{ color: "#fff" }} numberOfLines={2}>
        {j.title}
      </Text>
      <Text variant="caption" style={{ color: MUTED }} numberOfLines={1}>
        {[locLabel(j), j.remote ? "Remote" : null, j.type ? j.type.replace(/_/g, " ") : null].filter(Boolean).join(" · ")}
      </Text>
      <Pressable
        onPress={() => Linking.openURL(j.applyUrl).catch(() => {})}
        style={{ alignSelf: "flex-start", marginTop: 4, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: TEAL, borderRadius: radius.md, paddingHorizontal: space[3], paddingVertical: 7 }}
      >
        <Text variant="caption" style={{ color: "#04241f", fontWeight: "700" }}>
          Apply
        </Text>
        <Feather name="external-link" size={13} color="#04241f" />
      </Pressable>
    </View>
  );
}

function Centered({ text, retry }: { text: string; retry?: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space[8], gap: space[4] }}>
      <Text variant="callout" style={{ color: MUTED, textAlign: "center" }}>
        {text}
      </Text>
      {retry ? (
        <Pressable onPress={retry} style={{ backgroundColor: "rgba(255,255,255,0.1)", borderRadius: radius.md, paddingHorizontal: space[4], paddingVertical: space[2] }}>
          <Text variant="subhead" style={{ color: "#fff" }}>
            Try again
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
