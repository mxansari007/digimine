"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { getTeacher } from "@/lib/firestore/teachers";
import {
  getTeacherQuizzes,
  getTeacherTests,
  getTeacherCourses,
  getTeacherContests,
} from "@/lib/firestore/teacherContent";
import { getTeacherEnrollments } from "@/lib/firestore/teacherEnrollments";
import { PlanUsageBar } from "@/components/teacher/PlanUsageBar";
import type { SubscriptionPlan } from "@digimine/types";

function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "string") return new Date(value);
  if (value.seconds !== undefined) return new Date(value.seconds * 1000);
  return null;
}

const planLimits: Record<string, SubscriptionPlan> = {
  starter: {
    id: "starter",
    name: "Starter",
    priceINR: 499,
    priceUSD: 6,
    limits: {
      maxStudents: 50,
      maxTests: 5,
      maxQuizzes: 10,
      maxContests: 2,
      maxCourses: 2,
      maxQuestions: 200,
      pistonConcurrency: 2,
    },
    features: ["email_support"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceINR: 1499,
    priceUSD: 18,
    limits: {
      maxStudents: 300,
      maxTests: 20,
      maxQuizzes: 50,
      maxContests: 10,
      maxCourses: 10,
      maxQuestions: 2000,
      pistonConcurrency: 5,
    },
    features: ["priority_email_support"],
  },
  institution: {
    id: "institution",
    name: "Institution",
    priceINR: 4999,
    priceUSD: 60,
    limits: {
      maxStudents: -1,
      maxTests: -1,
      maxQuizzes: -1,
      maxContests: -1,
      maxCourses: -1,
      maxQuestions: 10000,
      pistonConcurrency: 8,
    },
    features: ["chat_call_support"],
  },
};

export default function TeacherDashboardPage() {
  const { firebaseUser } = useAuthContext();
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
  const plan = planLimits[teacher.subscription?.planId] || planLimits.starter;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-gray-500">
          Welcome back, {teacher.profile?.name || "Teacher"}.
        </p>
      </div>

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

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            {
              href: "/teacher/content/new/quiz",
              icon: "📝",
              label: "Create Quiz",
            },
            {
              href: "/teacher/content/new/test",
              icon: "📋",
              label: "Create Test",
            },
            {
              href: "/teacher/content/new/contest",
              icon: "🏆",
              label: "Create Contest",
            },
            {
              href: "/teacher/content/new/course",
              icon: "📚",
              label: "Create Course",
            },
            { href: "/teacher/students", icon: "👥", label: "Invite Students" },
          ].map((a) => (
            <Link key={a.href} href={a.href}>
              <Card className="p-4 text-center hover:shadow-md transition-shadow cursor-pointer h-full">
                <div className="text-2xl mb-2">{a.icon}</div>
                <div className="text-sm font-medium text-gray-700">
                  {a.label}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {plan.name} Plan Usage
        </h2>
        <div className="space-y-4">
          <PlanUsageBar
            label="Students"
            current={stats.students}
            max={plan.limits.maxStudents}
          />
          <PlanUsageBar
            label="Test Series"
            current={stats.tests}
            max={plan.limits.maxTests}
          />
          <PlanUsageBar
            label="Quizzes"
            current={stats.quizzes}
            max={plan.limits.maxQuizzes}
          />
          <PlanUsageBar
            label="Contests"
            current={stats.contests}
            max={plan.limits.maxContests}
          />
          <PlanUsageBar
            label="Courses"
            current={stats.courses}
            max={plan.limits.maxCourses}
          />
        </div>
      </Card>
    </div>
  );
}
