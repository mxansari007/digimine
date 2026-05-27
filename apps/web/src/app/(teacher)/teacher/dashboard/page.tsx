"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card } from "@digimine/ui";
import { FileText, ClipboardList, Trophy, BookOpen, Users } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTeachingFeatures } from "@/hooks/useTeachingFeatures";
import { HelpTutorial } from "@/components/help/HelpTutorial";
import { TUTORIALS } from "@/components/help/tutorials";
import { getTeacher } from "@/lib/firestore/teachers";
import {
  getTeacherQuizzes,
  getTeacherTests,
  getTeacherCourses,
  getTeacherContests,
} from "@/lib/firestore/teacherContent";
import { getTeacherEnrollments } from "@/lib/firestore/teacherEnrollments";

function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "string") return new Date(value);
  if (value.seconds !== undefined) return new Date(value.seconds * 1000);
  return null;
}

export default function TeacherDashboardPage() {
  const { firebaseUser } = useAuthContext();
  const teaching = useTeachingFeatures();
  const [teacher, setTeacher] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    quizzes: 0,
    tests: 0,
    courses: 0,
    contests: 0,
    students: 0,
  });
  const [trialDays, setTrialDays] = useState(0);

  useEffect(() => {
    if (!firebaseUser) return;
    (async () => {
      const t = await getTeacher(firebaseUser.uid);
      setTeacher(t);
      const [q, ts, c, cs, e] = await Promise.all([
        getTeacherQuizzes(firebaseUser.uid),
        getTeacherTests(firebaseUser.uid),
        getTeacherCourses(firebaseUser.uid),
        getTeacherContests(firebaseUser.uid),
        getTeacherEnrollments(firebaseUser.uid),
      ]);
      setStats({
        quizzes: q.length,
        tests: ts.length,
        courses: c.length,
        contests: cs.length,
        students: e.filter((en) => en.status === "active").length,
      });
      if (t?.subscription?.status === "trial" && t.subscription?.expiresAt) {
        const exp = toDate(t.subscription.expiresAt);
        if (exp) {
          const diff = Math.ceil(
            (exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          );
          setTrialDays(Math.max(0, diff));
        }
      }
      setLoading(false);
    })();
  }, [firebaseUser]);

  if (loading)
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Loading...
      </div>
    );
  if (!teacher)
    return (
      <Card className="p-8 text-center text-gray-500">
        Profile not found.{" "}
        <Link
          href="/teacher/onboarding"
          className="text-primary-700 hover:text-primary-800"
        >
          Complete onboarding →
        </Link>
      </Card>
    );

  const isTrial = teacher.subscription?.status === "trial";
  const isExpired = teacher.subscription?.status === "expired";

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <HelpTutorial {...TUTORIALS.teacher_dashboard} />
        </div>
        <p className="mt-1 text-gray-500">
          Welcome back, {teacher.profile?.name || "Teacher"}.
        </p>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Current plan
            </p>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {teaching.planName || (teacher.subscription?.planCode || teacher.subscription?.planId) || "Free"}
              {teacher.subscription?.cadence && (
                <span className="ml-2 text-xs font-medium text-slate-500">
                  · {teacher.subscription.cadence}
                </span>
              )}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(["question_bank_template_download", "question_bank_markdown_import", "ai_question_generation"] as const).map((k) => {
                const labels: Record<string, string> = {
                  question_bank_template_download: "Template download",
                  question_bank_markdown_import: "Markdown import",
                  ai_question_generation: "AI questions",
                };
                const on = teaching.has(k);
                return (
                  <span
                    key={k}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${on ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}
                  >
                    {on ? "✓" : "✗"} {labels[k]}
                  </span>
                );
              })}
            </div>
            {teacher.subscription?.expiresAt && (
              <p className="mt-2 text-xs text-slate-500">
                Renews on {(() => {
                  const d = toDate(teacher.subscription.expiresAt);
                  return d ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
                })()}.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/teacher/usage"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              View usage
            </Link>
            <Link
              href="/teacher/subscribe"
              className="rounded-xl border border-primary-200 bg-white px-4 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-50"
            >
              {teaching.planName && !teaching.planName.toLowerCase().includes("free") ? "Manage plan" : "Upgrade"}
            </Link>
          </div>
        </div>
      </Card>

      {isTrial && (
        <div className="rounded-2xl border border-primary-200/80 bg-primary-50/80 p-5 flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-primary-900 font-semibold text-lg">
              {trialDays} {trialDays === 1 ? "day" : "days"} left in free trial
            </p>
            <p className="text-primary-700 text-sm mt-1">
              Subscribe for ₹50/month to keep your classroom active.
            </p>
          </div>
          <Link
            href="/teacher/subscribe"
            className="rounded-xl border border-primary-700 bg-primary-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-primary-950/10 transition-colors hover:bg-primary-800"
          >
            Subscribe Now
          </Link>
        </div>
      )}

      {isExpired && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-red-800 font-semibold text-lg">Trial expired</p>
            <p className="text-red-600 text-sm mt-1">
              Students can view past content. Pay ₹50 to create new material.
            </p>
          </div>
          <Link
            href="/teacher/subscribe"
            className="rounded-xl border border-red-700 bg-red-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-red-950/10 transition-colors hover:bg-red-800"
          >
            Pay ₹50
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Students", value: stats.students },
          { label: "Quizzes", value: stats.quizzes },
          { label: "Test Series", value: stats.tests },
          { label: "Courses", value: stats.courses },
          { label: "Contests", value: stats.contests },
        ].map((s) => (
          <Card key={s.label} className="p-5 text-center">
            <div className="text-3xl font-bold text-gray-900">{s.value}</div>
            <div className="text-sm text-gray-500 mt-1">{s.label}</div>
          </Card>
        ))}
      </div>

      <div data-tour="quick-actions">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            {
              href: "/teacher/content/new/quiz",
              Icon: FileText,
              label: "Create Quiz",
            },
            {
              href: "/teacher/content/new/test",
              Icon: ClipboardList,
              label: "Create Test",
            },
            {
              href: "/teacher/content/new/contest",
              Icon: Trophy,
              label: "Create Contest",
            },
            {
              href: "/teacher/content/new/course",
              Icon: BookOpen,
              label: "Create Course",
            },
            {
              href: "/teacher/students",
              Icon: Users,
              label: "Invite Students",
            },
          ].map((a) => (
            <Link key={a.href} href={a.href}>
              <Card className="p-4 text-center hover:shadow-md transition-shadow cursor-pointer h-full">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                  <a.Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
                </div>
                <div className="text-sm font-medium text-gray-700">
                  {a.label}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
