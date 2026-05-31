"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthContext } from "@/contexts/AuthContext";

interface EnrolledTeacher {
    teacherId: string;
    teacherName: string;
    teacherInstitute: string;
}

/**
 * "My Teachers" header dropdown.
 *
 * IMPORTANT — this is a student-only utility. It used to do a
 * `getDocs(collection(db, "teachers"))` then probe each teacher's
 * `teacher_enrollments/{tid}/students` for the caller. Firestore rules
 * require either ownership / admin / enrolled-with-this-teacher for every
 * doc in the result set, so that read failed for everyone except platform
 * admins — and surfaced as "insufficient permissions" on every public
 * page that mounted the header. We now:
 *
 *   - Short-circuit on non-customer roles (teachers, institute admins,
 *     admins don't see this dropdown).
 *   - Resolve enrolments through `/api/classroom/my-enrollments`, which
 *     uses the admin SDK to do the cross-collection lookup safely.
 */
export function TeachersDropdown() {
    const { firebaseUser, user } = useAuthContext();
    const [teachers, setTeachers] = useState<EnrolledTeacher[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(true);

    const isCustomer = user?.role === "customer";

    useEffect(() => {
        if (!firebaseUser || !isCustomer) {
            setTeachers([]);
            setLoading(false);
            return;
        }
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const res = await fetch(
                    `/api/classroom/my-enrollments?studentId=${encodeURIComponent(firebaseUser.uid)}`,
                    { credentials: "same-origin" }
                );
                if (!res.ok) {
                    if (!cancelled) setTeachers([]);
                    return;
                }
                const data = await res.json();
                const list: EnrolledTeacher[] = Array.isArray(data?.classes)
                    ? (data.classes as Array<{
                          teacherId: string;
                          teacherName: string;
                          teacherInstitute: string;
                      }>)
                          // Deduplicate teachers — one teacher can own
                          // multiple classes the student is enrolled in.
                          .reduce<EnrolledTeacher[]>((acc, c) => {
                              if (!c.teacherId) return acc;
                              if (acc.some((t) => t.teacherId === c.teacherId)) return acc;
                              acc.push({
                                  teacherId: c.teacherId,
                                  teacherName: c.teacherName || "Teacher",
                                  teacherInstitute: c.teacherInstitute || "",
                              });
                              return acc;
                          }, [])
                    : [];
                if (!cancelled) setTeachers(list);
            } catch {
                if (!cancelled) setTeachers([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [firebaseUser, isCustomer]);

    if (!isCustomer || loading || teachers.length === 0) return null;

    return (
        <div className="relative">
            {/* Icon-only trigger with a small enrollment count chip so the
                header stays compact. Tooltip explains what it is on hover;
                the popover still shows the full teacher list. */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                aria-label="My classrooms"
                title="My classrooms"
                className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-primary-700"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.7}
                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                </svg>
                {teachers.length > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                        {teachers.length > 9 ? "9+" : teachers.length}
                    </span>
                )}
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />
                    <div className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                        <div className="border-b border-slate-100 px-3 py-2">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                My classrooms
                            </p>
                        </div>
                        <div className="p-2">
                            {teachers.map((teacher) => (
                                <Link
                                    key={teacher.teacherId}
                                    href={`/classroom/${teacher.teacherId}`}
                                    onClick={() => setIsOpen(false)}
                                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-primary-50/70 dark:hover:bg-primary-500/10"
                                >
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-500/15 text-xs font-bold text-primary-700 dark:text-primary-300 ring-1 ring-primary-200 dark:ring-primary-500/25">
                                        {teacher.teacherName[0]?.toUpperCase() || "T"}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-slate-900">
                                            {teacher.teacherName}
                                        </p>
                                        <p className="truncate text-xs text-slate-500">
                                            {teacher.teacherInstitute}
                                        </p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                        <div className="border-t border-slate-100 p-2">
                            <Link
                                href="/student/classrooms"
                                onClick={() => setIsOpen(false)}
                                className="block px-3 py-2 text-sm font-medium text-primary-700 hover:text-primary-800"
                            >
                                View all classrooms →
                            </Link>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
