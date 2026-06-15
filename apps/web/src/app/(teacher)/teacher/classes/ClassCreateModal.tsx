"use client";

/**
 * Create-a-class flow for the new model: subject + reuse-an-existing-section
 * (or make a new one) + target/combine groups + weekly timetable. If the
 * teacher's profile has no university yet, it gracefully degrades to a plain
 * subject-named class (and nudges them to set their university).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import { Button, Card } from "@digimine/ui";
import { teacherFetch } from "@/lib/api/teacherFetch";

interface SectionRow {
    id: string;
    name: string;
    program: string | null;
    batchYear: number | null;
}
interface GroupRow {
    id: string;
    name: string;
}

type PickedSection =
    | { kind: "existing"; id: string; name: string; label: string }
    | { kind: "new"; name: string; program: string; batchYear: string }
    | null;

interface Meeting {
    day: string;
    startTime: string;
    endTime: string;
    room: string;
}

const DAYS: { value: string; label: string }[] = [
    { value: "mon", label: "Mon" },
    { value: "tue", label: "Tue" },
    { value: "wed", label: "Wed" },
    { value: "thu", label: "Thu" },
    { value: "fri", label: "Fri" },
    { value: "sat", label: "Sat" },
    { value: "sun", label: "Sun" },
];

const inputCls =
    "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900";

export function ClassCreateModal({
    firebaseUser,
    onClose,
    onCreated,
}: {
    firebaseUser: FirebaseUser;
    onClose: () => void;
    onCreated: () => void;
}) {
    const [universityId, setUniversityId] = useState<string | null>(null);
    const [uniLoaded, setUniLoaded] = useState(false);

    const [subject, setSubject] = useState("");
    const [room, setRoom] = useState("");
    const [description, setDescription] = useState("");

    // Section picker
    const [sectionQuery, setSectionQuery] = useState("");
    const [sectionResults, setSectionResults] = useState<SectionRow[]>([]);
    const [sectionOpen, setSectionOpen] = useState(false);
    const [picked, setPicked] = useState<PickedSection>(null);
    const [program, setProgram] = useState("");
    const [batchYear, setBatchYear] = useState("");

    // Groups
    const [groupOptions, setGroupOptions] = useState<GroupRow[]>([]);
    const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
    const [newGroupsText, setNewGroupsText] = useState("");

    // Timetable
    const [meetings, setMeetings] = useState<Meeting[]>([]);

    const [creating, setCreating] = useState(false);
    const [error, setError] = useState("");
    const sectionBox = useRef<HTMLDivElement>(null);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Learn the teacher's university (and seed the section list) on open.
    useEffect(() => {
        (async () => {
            try {
                const res = await teacherFetch(firebaseUser, "/api/sections?q=");
                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                    setUniversityId(data.universityId || null);
                    setSectionResults(Array.isArray(data.sections) ? data.sections : []);
                }
            } finally {
                setUniLoaded(true);
            }
        })();
    }, [firebaseUser]);

    useEffect(() => {
        function onDoc(e: MouseEvent) {
            if (sectionBox.current && !sectionBox.current.contains(e.target as Node)) setSectionOpen(false);
        }
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const searchSections = useCallback(
        (q: string) => {
            if (searchTimer.current) clearTimeout(searchTimer.current);
            searchTimer.current = setTimeout(async () => {
                try {
                    const res = await teacherFetch(
                        firebaseUser,
                        `/api/sections?q=${encodeURIComponent(q)}`
                    );
                    const data = await res.json().catch(() => ({}));
                    if (res.ok) setSectionResults(Array.isArray(data.sections) ? data.sections : []);
                } catch {
                    /* keep prior results */
                }
            }, 200);
        },
        [firebaseUser]
    );

    async function pickExisting(s: SectionRow) {
        const label = [s.program, s.name].filter(Boolean).join(" · ");
        setPicked({ kind: "existing", id: s.id, name: s.name, label });
        setSectionQuery(label);
        setSectionOpen(false);
        setSelectedGroupIds([]);
        setGroupOptions([]);
        // Load this section's groups to offer as targets.
        try {
            const res = await teacherFetch(firebaseUser, `/api/sections/${s.id}/groups`);
            const data = await res.json().catch(() => ({}));
            if (res.ok) setGroupOptions(Array.isArray(data.groups) ? data.groups : []);
        } catch {
            /* groups optional */
        }
    }

    function pickNew() {
        setPicked({ kind: "new", name: sectionQuery.trim(), program: "", batchYear: "" });
        setSectionOpen(false);
        setGroupOptions([]);
        setSelectedGroupIds([]);
    }

    function clearSection() {
        setPicked(null);
        setSectionQuery("");
        setGroupOptions([]);
        setSelectedGroupIds([]);
        setNewGroupsText("");
    }

    function toggleGroup(id: string) {
        setSelectedGroupIds((prev) =>
            prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
        );
    }

    function addMeeting() {
        setMeetings((m) => [...m, { day: "mon", startTime: "10:00", endTime: "11:00", room: "" }]);
    }
    function updateMeeting(i: number, patch: Partial<Meeting>) {
        setMeetings((m) => m.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
    }
    function removeMeeting(i: number) {
        setMeetings((m) => m.filter((_, idx) => idx !== i));
    }

    const parsedNewGroups = newGroupsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

    async function handleCreate() {
        if (!subject.trim()) {
            setError("Subject is required.");
            return;
        }
        setCreating(true);
        setError("");
        try {
            const payload: Record<string, any> = {
                subject: subject.trim(),
                description: description.trim() || undefined,
                room: room.trim() || undefined,
                meetings: meetings.map((m) => ({
                    day: m.day,
                    startTime: m.startTime,
                    endTime: m.endTime,
                    room: m.room.trim() || null,
                })),
            };

            if (universityId && picked?.kind === "existing") {
                payload.sectionId = picked.id;
                payload.groupIds = selectedGroupIds;
                payload.groups = parsedNewGroups;
            } else if (universityId && picked?.kind === "new" && picked.name) {
                payload.section = {
                    name: picked.name,
                    program: program.trim() || undefined,
                    batchYear: batchYear ? Number(batchYear) : undefined,
                };
                payload.groups = parsedNewGroups;
            }
            // No university / no section picked → the server creates a plain
            // subject-named class (still valid).

            const res = await teacherFetch(firebaseUser, "/api/teacher/classes", {
                method: "POST",
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create class.");
            onCreated();
        } catch (err: any) {
            setError(err.message || "Failed to create class.");
        } finally {
            setCreating(false);
        }
    }

    const showSectionUI = uniLoaded && universityId;

    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
            onClick={() => !creating && onClose()}
        >
            <Card className="my-8 w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
                <h3 className="mb-1 text-lg font-semibold text-gray-900 dark:text-slate-100">Create a class</h3>
                <p className="mb-4 text-sm text-gray-500">
                    A class teaches one subject to a section&rsquo;s group(s), on a weekly timetable.
                </p>

                <div className="space-y-4">
                    {/* Subject */}
                    <Field label="Subject" required>
                        <input
                            className={inputCls}
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="e.g. Data Structures"
                            maxLength={80}
                            autoFocus
                        />
                    </Field>

                    {uniLoaded && !universityId && (
                        <Card className="border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
                            Add your university in your profile to use sections &amp; timetables. For now this
                            creates a basic class named after the subject.
                        </Card>
                    )}

                    {/* Section */}
                    {showSectionUI && (
                        <Field label="Section" hint="Reuse an existing one, or add a new section">
                            {picked ? (
                                <div className="flex items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm dark:border-indigo-500/30 dark:bg-indigo-500/10">
                                    <span className="font-medium text-indigo-800 dark:text-indigo-200">
                                        {picked.kind === "existing" ? picked.label : `New: ${picked.name}`}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={clearSection}
                                        className="text-xs text-indigo-600 hover:underline dark:text-indigo-300"
                                    >
                                        Change
                                    </button>
                                </div>
                            ) : (
                                <div className="relative" ref={sectionBox}>
                                    <input
                                        className={inputCls}
                                        value={sectionQuery}
                                        onChange={(e) => {
                                            setSectionQuery(e.target.value);
                                            setSectionOpen(true);
                                            searchSections(e.target.value);
                                        }}
                                        onFocus={() => setSectionOpen(true)}
                                        placeholder="e.g. CSE-A or B.Tech CSE 2026"
                                        autoComplete="off"
                                    />
                                    {sectionOpen && (
                                        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                                            {sectionResults.map((s) => {
                                                const label = [s.program, s.name].filter(Boolean).join(" · ");
                                                return (
                                                    <button
                                                        type="button"
                                                        key={s.id}
                                                        onClick={() => pickExisting(s)}
                                                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-slate-800"
                                                    >
                                                        <span className="text-gray-900 dark:text-slate-100">{label}</span>
                                                        {s.batchYear ? (
                                                            <span className="text-xs text-gray-400">{s.batchYear}</span>
                                                        ) : null}
                                                    </button>
                                                );
                                            })}
                                            {sectionQuery.trim().length >= 1 && (
                                                <button
                                                    type="button"
                                                    onClick={pickNew}
                                                    className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-left text-sm text-indigo-700 hover:bg-indigo-50 dark:border-slate-800 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                                                >
                                                    ＋ New section &ldquo;{sectionQuery.trim()}&rdquo;
                                                </button>
                                            )}
                                            {!sectionResults.length && sectionQuery.trim().length < 1 && (
                                                <div className="px-3 py-2 text-sm text-gray-400">
                                                    Type a section name…
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </Field>
                    )}

                    {/* New-section extra fields */}
                    {showSectionUI && picked?.kind === "new" && (
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Program" hint="Optional">
                                <input
                                    className={inputCls}
                                    value={program}
                                    onChange={(e) => setProgram(e.target.value)}
                                    placeholder="B.Tech CSE"
                                />
                            </Field>
                            <Field label="Batch year" hint="Optional">
                                <input
                                    className={inputCls}
                                    value={batchYear}
                                    onChange={(e) => setBatchYear(e.target.value.replace(/[^0-9]/g, ""))}
                                    placeholder="2026"
                                    maxLength={4}
                                    inputMode="numeric"
                                />
                            </Field>
                        </div>
                    )}

                    {/* Groups */}
                    {showSectionUI && picked && (
                        <Field
                            label="Groups"
                            hint="Pick the group(s) this class teaches — select several to combine them into one roster"
                        >
                            {groupOptions.length > 0 && (
                                <div className="mb-2 flex flex-wrap gap-2">
                                    {groupOptions.map((g) => {
                                        const on = selectedGroupIds.includes(g.id);
                                        return (
                                            <button
                                                type="button"
                                                key={g.id}
                                                onClick={() => toggleGroup(g.id)}
                                                className={`rounded-full border px-3 py-1 text-sm ${
                                                    on
                                                        ? "border-indigo-500 bg-indigo-600 text-white"
                                                        : "border-gray-300 bg-white text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                                }`}
                                            >
                                                {g.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                            <input
                                className={inputCls}
                                value={newGroupsText}
                                onChange={(e) => setNewGroupsText(e.target.value)}
                                placeholder={
                                    groupOptions.length
                                        ? "Add new groups (comma separated)"
                                        : "Groups, comma separated — e.g. G1, G2"
                                }
                            />
                        </Field>
                    )}

                    {/* Room */}
                    {showSectionUI && (
                        <Field label="Default room" hint="Optional">
                            <input
                                className={inputCls}
                                value={room}
                                onChange={(e) => setRoom(e.target.value)}
                                placeholder="e.g. Room 301"
                            />
                        </Field>
                    )}

                    {/* Timetable */}
                    {showSectionUI && (
                        <Field label="Timetable" hint="Weekly class slots — builds the student timetable">
                            <div className="space-y-2">
                                {meetings.map((m, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <select
                                            className={`${inputCls} w-20`}
                                            value={m.day}
                                            onChange={(e) => updateMeeting(i, { day: e.target.value })}
                                        >
                                            {DAYS.map((d) => (
                                                <option key={d.value} value={d.value}>
                                                    {d.label}
                                                </option>
                                            ))}
                                        </select>
                                        <input
                                            type="time"
                                            className={`${inputCls} w-28`}
                                            value={m.startTime}
                                            onChange={(e) => updateMeeting(i, { startTime: e.target.value })}
                                        />
                                        <input
                                            type="time"
                                            className={`${inputCls} w-28`}
                                            value={m.endTime}
                                            onChange={(e) => updateMeeting(i, { endTime: e.target.value })}
                                        />
                                        <input
                                            className={`${inputCls} flex-1`}
                                            value={m.room}
                                            onChange={(e) => updateMeeting(i, { room: e.target.value })}
                                            placeholder="Room"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeMeeting(i)}
                                            className="px-2 text-gray-400 hover:text-red-500"
                                            aria-label="Remove slot"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={addMeeting}
                                    className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-300"
                                >
                                    ＋ Add slot
                                </button>
                            </div>
                        </Field>
                    )}

                    {/* Description */}
                    <Field label="Description" hint="Optional">
                        <textarea
                            className={`${inputCls} resize-none`}
                            rows={2}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Anything students should know…"
                        />
                    </Field>

                    {error && (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
                            {error}
                        </div>
                    )}
                </div>

                <div className="mt-5 flex gap-2">
                    <Button
                        variant="primary"
                        className="flex-1"
                        onClick={handleCreate}
                        isLoading={creating}
                        disabled={!subject.trim()}
                    >
                        Create class
                    </Button>
                    <Button variant="outline" onClick={onClose} disabled={creating}>
                        Cancel
                    </Button>
                </div>
            </Card>
        </div>
    );
}

function Field({
    label,
    hint,
    required,
    children,
}: {
    label: string;
    hint?: string;
    required?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div>
            <div className="mb-1 flex items-baseline justify-between">
                <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
                    {label}
                    {required && <span className="text-rose-500"> *</span>}
                </label>
                {hint && <span className="text-xs text-gray-400">{hint}</span>}
            </div>
            {children}
        </div>
    );
}
