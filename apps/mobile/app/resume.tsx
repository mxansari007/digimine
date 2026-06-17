import { useCallback, useEffect, useState } from "react";
import { RefreshControl, View } from "react-native";
import { Stack } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { api, resumePdfBase64, type ResumeSummary } from "@/lib/api";
import { useColors } from "@/design/theme";
import { space } from "@/design/tokens";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Screen,
  ScreenScroll,
  Text,
} from "@/design/ui";

type Tone = React.ComponentProps<typeof Chip>["tone"];

function atsTone(score: number): Tone {
  return score >= 80 ? "success" : score >= 60 ? "warning" : "danger";
}

function templateLabel(id: string): string {
  if (!id) return "Resume";
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  try {
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function fileSlug(title: string): string {
  const s = (title || "resume")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return s || "resume";
}

export default function ResumeScreen() {
  const c = useColors();
  const [items, setItems] = useState<ResumeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.resumes();
      setItems(res.resumes || []);
    } catch (e: any) {
      setError(e?.message || "Couldn't load your resumes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openPdf = useCallback(async (r: ResumeSummary) => {
    setActionError(null);
    setBusyId(r.id);
    try {
      const base64 = await resumePdfBase64(r.id);
      const uri = `${FileSystem.cacheDirectory || ""}${fileSlug(r.title)}.pdf`;
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: r.title || "Resume",
          UTI: "com.adobe.pdf",
        });
      } else {
        setActionError("Sharing isn't available on this device.");
      }
    } catch (e: any) {
      setActionError(e?.message || "Couldn't open the PDF. Try again.");
    } finally {
      setBusyId(null);
    }
  }, []);

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: "Résumés" }} />
      <ScreenScroll
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load().finally(() => setRefreshing(false));
            }}
            tintColor={c.textSubtle}
          />
        }
      >
        <Card style={{ backgroundColor: c.surfaceAlt, marginBottom: space[4] }}>
          <Text variant="footnote" color="textMuted">
            Build and edit your resumes on PlacementRanker on the web. Here you can preview the latest
            version and download it to your phone.
          </Text>
        </Card>

        {actionError ? (
          <Card style={{ marginBottom: space[4], backgroundColor: c.dangerSubtle, borderColor: c.danger }}>
            <Text variant="footnote" color="danger">{actionError}</Text>
          </Card>
        ) : null}

        {error ? <ErrorState message={error} onRetry={load} /> : null}
        {loading ? <ListSkeleton rows={4} /> : null}

        {!loading && !error && items.length === 0 ? (
          <EmptyState
            icon="file-text"
            title="No resumes yet"
            body="Create your first resume on the web, then come back to preview and download it here."
          />
        ) : null}

        {items.map((r) => (
          <Card key={r.id} style={{ marginBottom: space[3], gap: space[3] }}>
            <Text variant="subhead">{r.title || "Untitled resume"}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
              <Chip label={templateLabel(r.templateId)} />
              {r.atsScore != null ? <Chip label={`ATS ${r.atsScore}`} tone={atsTone(r.atsScore)} /> : null}
            </View>
            {fmtDate(r.updatedAt) ? (
              <Text variant="caption" color="textSubtle">Updated {fmtDate(r.updatedAt)}</Text>
            ) : null}
            <Button
              label="Open / download PDF"
              leftIcon="download"
              variant="secondary"
              loading={busyId === r.id}
              onPress={() => openPdf(r)}
            />
          </Card>
        ))}
      </ScreenScroll>
    </Screen>
  );
}
