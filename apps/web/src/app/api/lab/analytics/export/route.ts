import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/server/classroomAccess";
import { resolveClassLabRole } from "@/lib/server/labStore";
import { computeClassAnalytics } from "@/lib/server/labAnalytics";
import { rateLimit } from "@/lib/server/ratelimit";
import type { LabSessionAnalytics, LabStudentStats } from "@digimine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/lab/analytics/export?classId=... — TEACHER-ONLY CSV evidence export of
 * a class's virtual-lab participation, shaped for NAAC/NBA accreditation files.
 *
 * Reuses `computeClassAnalytics` (the SAME on-read fold the JSON `/api/lab/
 * analytics` route serves — NO duplicated aggregation, NO new Firestore writes)
 * and streams the result as a downloadable CSV. The per-session and per-student
 * breakdown is the documentary evidence an accreditation visit asks for:
 *   - which live labs ran, on what dates, with how many students,
 *   - and, for every student in every session, their attendance, time in lab,
 *     on-task share, hands raised, and screen shares.
 *
 * Gate mirrors the sibling lab analytics routes (teacher-only — the per-student
 * engagement reveals every learner, so a student gets 403):
 *   verify token → require classId → rate-limit → resolve role (403 unless
 *   teacher) → fold → emit CSV.
 *
 * The CSV has FOUR labelled blocks (blank-line separated, Excel/Sheets-friendly):
 *   0. a small report header (class name + id + generated timestamp + totals),
 *   1. "Sessions held" — one row per session,
 *   2. "Student participation" — one row per (session × student),
 *   3. "Student totals — ALL SESSIONS" — class-summed per-student totals.
 */

// ─────────────────────────────────────────────────────────────────────
// CSV helpers (local — kept tiny; mirrors institute/reports csvEscape)
// ─────────────────────────────────────────────────────────────────────

/** Control chars (C0 + DEL) to strip from any cell so an attacker-set display
 *  name can't smuggle a newline/tab into the CSV and break row alignment. Built
 *  from \u escapes via RegExp so the source carries no literal control bytes. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001F\\u007F]", "g");

/** Quote a field iff it contains a comma, quote, CR or LF; double inner quotes.
 *  Also strips control chars (see {@link CONTROL_CHARS}) and neutralises
 *  spreadsheet formula injection (a leading =,+,-,@). */
function csvEscape(value: string | number | null | undefined): string {
    const raw = value === null || value === undefined ? "" : String(value);
    const cleaned = raw.replace(CONTROL_CHARS, " ").trim();
    // A leading =,+,-,@ is treated as a formula by Excel/Sheets — prefix a single
    // quote so it renders as text (CSV-injection defence on user-set names).
    const safe = /^[=+\-@]/.test(cleaned) ? `'${cleaned}` : cleaned;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Build one CSV line from a list of cells. */
function row(cells: Array<string | number | null | undefined>): string {
    return cells.map(csvEscape).join(",");
}

/** Epoch-millis duration → whole minutes (integer). NAAC tables want a number. */
function minutesOf(ms: number): number {
    return Math.max(0, Math.round((Number.isFinite(ms) ? ms : 0) / 60000));
}

/** On-task share of in-lab time as a clamped 0–100 integer (0 when no time). */
function onTaskPct(s: LabStudentStats): number {
    if (!s.timeInLabMs || s.timeInLabMs <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((s.onTaskMs / s.timeInLabMs) * 100)));
}

/** ISO datetime → "YYYY-MM-DD HH:MM" (UTC); "" when null. Sortable + readable. */
function fmtDate(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 16).replace("T", " ");
}

/** A short, filesystem-safe slug for the download filename. */
function slugify(value: string): string {
    return (
        value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 48) || "class"
    );
}

export async function GET(req: Request) {
    try {
        const auth = await requireVerifiedUser(req);
        if (!auth.ok) {
            return NextResponse.json(
                { error: auth.error, code: auth.code },
                { status: auth.status }
            );
        }

        const url = new URL(req.url);
        const classId = (url.searchParams.get("classId") || "").trim();
        if (!classId) {
            return NextResponse.json({ error: "classId is required." }, { status: 400 });
        }

        // Throttle the export: each call folds up to 200 sessions × (roster +
        // events). Cheap to abuse otherwise. Fail-open if Redis is down.
        const rl = await rateLimit("lab-analytics-export", `${auth.userId}:${classId}`, {
            limit: 10,
            windowSeconds: 60,
        });
        if (!rl.success) {
            return NextResponse.json(
                {
                    error: "You're exporting too fast. Please wait a few seconds and try again.",
                    code: "rate_limited",
                },
                { status: 429, headers: { "Retry-After": "10" } }
            );
        }

        // Teacher-only gate on the class. `classDoc` rides along so we can name
        // the report/file without a second read.
        const resolved = await resolveClassLabRole(classId, auth.userId);
        if (!resolved || resolved.role !== "teacher") {
            return NextResponse.json(
                { error: "Only the class teacher can export lab evidence." },
                { status: 403 }
            );
        }

        const className: string =
            (typeof resolved.classDoc?.name === "string" && resolved.classDoc.name) ||
            "Class";

        // Reuse the existing aggregation — DO NOT duplicate the fold.
        const { sessions, students } = await computeClassAnalytics(classId);

        const csv = buildCsv(className, classId, sessions, students);

        const datePart = new Date().toISOString().slice(0, 10);
        const filename = `lab-participation-${slugify(className)}-${datePart}.csv`;

        // Prepend a UTF-8 BOM so Excel reads names with diacritics correctly.
        // Built from a char code (not a literal byte) to keep the source clean.
        const BOM = String.fromCharCode(0xfeff);
        return new NextResponse(`${BOM}${csv}`, {
            status: 200,
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (error: unknown) {
        console.error("Lab analytics export failed:", error);
        const message =
            error instanceof Error ? error.message : "Failed to export lab analytics";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// ─────────────────────────────────────────────────────────────────────
// CSV assembly
// ─────────────────────────────────────────────────────────────────────

/**
 * Assemble the accreditation CSV from the already-folded analytics. Four
 * labelled blocks separated by blank lines (see route doc). Pure string work —
 * no I/O — so it stays trivially testable.
 */
function buildCsv(
    className: string,
    classId: string,
    sessions: LabSessionAnalytics[],
    students: LabStudentStats[]
): string {
    const lines: string[] = [];

    // ── Block 0: report header ──────────────────────────────────────────
    const totalAttendance = sessions.reduce((sum, s) => sum + s.participantCount, 0);
    const distinctStudents = students.length;
    lines.push(row(["Virtual Lab participation report"]));
    lines.push(row(["Class", className]));
    lines.push(row(["Class ID", classId]));
    lines.push(row(["Generated (UTC)", new Date().toISOString()]));
    lines.push(row(["Sessions held", sessions.length]));
    lines.push(row(["Total attendance (student-joins)", totalAttendance]));
    lines.push(row(["Distinct students", distinctStudents]));
    lines.push("");

    // ── Block 1: sessions held (one row per session) ────────────────────
    lines.push(row(["Sessions held"]));
    lines.push(
        row([
            "Session #",
            "Title",
            "Started (UTC)",
            "Ended (UTC)",
            "Status",
            "Students attended",
            "Peak concurrent",
            "Avg time in lab (min)",
            "Hands raised",
            "Screen shares",
        ])
    );
    // `sessions` arrives newest-first; number them oldest→newest (1 = first lab
    // held) so the evidence reads chronologically like a register.
    const chrono = [...sessions].reverse();
    chrono.forEach((s, i) => {
        lines.push(
            row([
                i + 1,
                s.title || "Lab session",
                fmtDate(s.startedAt),
                fmtDate(s.endedAt),
                s.endedAt ? "ended" : s.startedAt ? "live" : "scheduled",
                s.participantCount,
                s.peakParticipants,
                minutesOf(s.avgTimeInLabMs),
                s.totalHands,
                s.totalShares,
            ])
        );
    });
    lines.push("");

    // ── Block 2: per-student participation (session × student) ──────────
    lines.push(row(["Student participation"]));
    lines.push(
        row([
            "Session #",
            "Session title",
            "Date (UTC)",
            "Student",
            "UID",
            "Attended",
            "Time in lab (min)",
            "On task (%)",
            "Hands raised",
            "Shares to teacher",
            "Peer shares",
            "Spotlighted",
        ])
    );

    chrono.forEach((s, i) => {
        const num = i + 1;
        const date = fmtDate(s.startedAt);
        if (s.students.length === 0) {
            // Keep a placeholder row so a held-but-empty session still appears in
            // the participation register (accreditation wants the gap visible).
            lines.push(
                row([
                    num,
                    s.title || "Lab session",
                    date,
                    "(no students joined)",
                    "",
                    "no",
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                ])
            );
            return;
        }
        for (const st of s.students) {
            lines.push(
                row([
                    num,
                    s.title || "Lab session",
                    date,
                    st.name,
                    st.uid,
                    "yes",
                    minutesOf(st.timeInLabMs),
                    onTaskPct(st),
                    st.handsRaised,
                    st.sharesToTeacher,
                    st.peerSharesGiven,
                    st.spotlights,
                ])
            );
        }
    });
    lines.push("");

    // ── Block 3: class-summed per-student totals ────────────────────────
    lines.push(row(["Student totals — ALL SESSIONS"]));
    lines.push(
        row([
            "Student",
            "UID",
            "Sessions attended",
            "Total time in lab (min)",
            "On task (%)",
            "Hands raised",
            "Shares to teacher",
            "Peer shares",
            "Spotlighted",
        ])
    );
    // `students` arrives highest-engagement first; keep that order for the totals.
    for (const st of students) {
        lines.push(
            row([
                st.name,
                st.uid,
                st.attendedSessions,
                minutesOf(st.timeInLabMs),
                onTaskPct(st),
                st.handsRaised,
                st.sharesToTeacher,
                st.peerSharesGiven,
                st.spotlights,
            ])
        );
    }

    // CRLF line endings — the safest CSV newline for Excel on Windows.
    return lines.join("\r\n");
}
