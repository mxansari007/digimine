"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import {
  getTeacherTestsInSeries,
  deleteTeacherTestInSeries,
} from "@/lib/firestore/tests";
import type { Test } from "@digimine/types";

export default function TeacherSeriesTestsPage() {
  const params = useParams();
  const seriesId = params.id as string;

  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [seriesId]);

  async function loadData() {
    try {
      setLoading(true);
      const testsData = await getTeacherTestsInSeries(seriesId);
      setTests(testsData);
    } catch (error: any) {
      console.error("Error loading tests:", error);
    } finally {
      setLoading(false);
    }
  }

  const handleDeleteTest = async (testId: string) => {
    if (!confirm("Delete this test? All questions will be lost.")) return;
    try {
      await deleteTeacherTestInSeries(seriesId, testId);
      setTests((current) => current.filter((t) => t.id !== testId));
    } catch (error: any) {
      alert("Failed to delete test");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/teacher/content">
            <Button variant="outline" size="sm">
              ← Back
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-slate-950">Tests in Series</h1>
        </div>
        <Link href={`/teacher/content/tests/${seriesId}/tests/create`}>
          <Button variant="primary" size="sm">
            + Add Test
          </Button>
        </Link>
      </div>

      {tests.length === 0 ? (
        <Card className="p-12 text-center border border-dashed border-slate-300/80 bg-white/90">
          <p className="text-slate-500 mb-4">No tests in this series yet</p>
          <Link href={`/teacher/content/tests/${seriesId}/tests/create`}>
            <Button variant="primary">+ Add First Test</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {tests.map((test, index) => (
            <Card
              key={test.id}
              className="p-5 border border-slate-200/80 bg-white/90"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 bg-primary-100/80 text-primary-700 rounded-full flex items-center justify-center text-sm font-medium">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold text-slate-950">
                      {test.title}
                    </h3>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {test.duration} mins
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {test.totalQuestions || 0} Qs
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {test.totalMarks} Marks
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/teacher/content/tests/${seriesId}/tests/${test.id}/questions`}
                  >
                    <Button variant="outline" size="sm">
                      Questions
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-200 text-red-700 hover:bg-red-50"
                    onClick={() => handleDeleteTest(test.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
