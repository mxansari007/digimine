"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { PageLoading } from "@/components/common";

type Entry = {
    classId: string;
    subject: string;
    teacherName: string;
    sectionName: string | null;
    room: string | null;
    day: string;
    startTime: string;
    endTime: string;
};

const DAYS = [
    { key: "mon", short: "Mon" },
    { key: "tue", short: "Tue" },
    { key: "wed", short: "Wed" },
    { key: "thu", short: "Thu" },
    { key: "fri", short: "Fri" },
    { key: "sat", short: "Sat" },
] as const;

// JS getDay(): 0=Sun … 6=Sat
const JS_DAY_TO_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export default function StudentTimetablePage() {
    const { firebaseUser } = useAuthContext();
    const [entries, setEntries] = useState<Entry[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!firebaseUser) return;
        setLoading(true);
        try {
            const token = await firebaseUser.getIdToken();
            // Unified across teacher-model + institute-model classes.
            const res = await fetch(`/api/student/timetable`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setEntries(Array.isArray(data.entries) ? data.entries : []);
        } catch {
            setEntries([]);
        } finally {
            setLoading(false);
        }
    }, [firebaseUser]);

    useEffect(() => {
        load();
    }, [load]);

    const byDay = useMemo(() => {
        const map: Record<string, Entry[]> = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] };
        for (const e of entries) {
            if (!map[e.day]) continue;
            map[e.day].push(e);
        }
        for (const k of Object.keys(map)) map[k].sort((a, b) => a.startTime.localeCompare(b.startTime));
        return map;
    }, [entries]);

    const totalSlots = entries.length;
    const todayKey = JS_DAY_TO_KEY[new Date().getDay()];

    if (loading) return <PageLoading variant="inline" />;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Timetable</h1>
                    <p className="mt-1 text-gray-500">Your weekly classes across all subjects.</p>
                </div>
                <Link
                    href="/student/classrooms"
                    className="text-sm font-medium text-indigo-600 hover:underline"
                >
                    My subjects →
                </Link>
            </div>

            {totalSlots === 0 ? (
                <Card className="p-12 text-center">
                    <p className="text-gray-500">
                        No timetable yet. Once your teachers set class times, they&apos;ll show up here.
                    </p>
                </Card>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                    {DAYS.map((d) => {
                        const slots = byDay[d.key];
                        const isToday = d.key === todayKey;
                        return (
                            <Card key={d.key} className={`p-4 ${isToday ? "ring-2 ring-indigo-500" : ""}`}>
                                <div className="mb-3 flex items-center justify-between">
                                    <h3 className="font-semibold text-gray-900">{d.short}</h3>
                                    {isToday && (
                                        <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                                            Today
                                        </span>
                                    )}
                                </div>
                                {slots.length === 0 ? (
                                    <p className="text-xs text-gray-400">No classes</p>
                                ) : (
                                    <div className="space-y-2">
                                        {slots.map((s, i) => (
                                            <Link
                                                key={`${s.classId}-${i}`}
                                                href={`/classroom/${s.classId}`}
                                                className="block rounded-lg border-l-4 border-indigo-500 bg-gray-50 px-3 py-2 hover:bg-gray-100 dark:bg-slate-800/50 dark:hover:bg-slate-800"
                                            >
                                                <p className="font-mono text-[11px] text-gray-500">
                                                    {s.startTime}–{s.endTime}
                                                </p>
                                                <p className="truncate text-sm font-semibold text-gray-900">
                                                    {s.subject}
                                                </p>
                                                <p className="truncate text-xs text-gray-500">
                                                    {s.teacherName}
                                                    {s.room ? ` · ${s.room}` : ""}
                                                </p>
                                                {s.sectionName && (
                                                    <p className="truncate text-[11px] text-gray-400">
                                                        {s.sectionName}
                                                    </p>
                                                )}
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
