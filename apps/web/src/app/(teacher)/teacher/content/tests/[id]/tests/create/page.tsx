"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import {
  getTeacherTestSeries,
  createTeacherTestInSeries,
} from "@/lib/firestore/tests";
import type { TestSeries, TestSectionInput } from "@digimine/types";

export default function TeacherCreateSubTestPage() {
  const params = useParams();
  const router = useRouter();
  const seriesId = params.id as string;

  const [series, setSeries] = useState<TestSeries | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(60);
  const [totalMarks, setTotalMarks] = useState(100);
  const [passingMarks, setPassingMarks] = useState(33);
  const [sections, setSections] = useState<TestSectionInput[]>([]);
  const [instantResults, setInstantResults] = useState(true);
  const [allowRetake, setAllowRetake] = useState(false);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await getTeacherTestSeries(seriesId);
        setSeries(data);
        if (data) {
          setInstantResults(data.instantResults ?? true);
          setAllowRetake(data.allowRetake ?? false);
          setShuffleQuestions(data.shuffleQuestions ?? false);
          setShuffleOptions(data.shuffleOptions ?? false);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [seriesId]);

  const addSection = () => {
    setSections((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title: "",
        description: "",
        order: prev.length,
      },
    ]);
  };

  const updateSection = (
    index: number,
    field: keyof TestSectionInput,
    value: string | number
  ) => {
    setSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  const removeSection = (index: number) => {
    setSections((prev) =>
      prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i }))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return alert("Title is required");
    setSaving(true);
    try {
      // createTeacherTestInSeries returns the new test id — route the
      // teacher straight into the question editor for it instead of
      // landing back on the series tests list (where they'd have to
      // click into the test they just created to do the same thing).
      const testId = await createTeacherTestInSeries({
        seriesId,
        title: title.trim(),
        description: description.trim(),
        duration,
        totalMarks,
        passingMarks,
        status: "draft",
        instantResults,
        allowRetake,
        shuffleQuestions,
        shuffleOptions,
        sections: sections.filter((s) => s.title.trim()),
      });
      router.push(`/teacher/content/tests/${seriesId}/tests/${testId}/questions`);
    } catch (err: any) {
      alert(err.message || "Failed to create test");
    }
    setSaving(false);
  };

  if (loading)
    return <div className="p-8 text-center text-slate-500">Loading...</div>;
  if (!series)
    return (
      <div className="p-8 text-center text-slate-500">Series not found</div>
    );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-950">
          Add Test to {series.title}
        </h1>
        <Link href={`/teacher/content/tests/${seriesId}/tests`}>
          <Button variant="outline" size="sm">
            Cancel
          </Button>
        </Link>
      </div>

      <Card className="p-6 border border-slate-200/80 bg-white/90">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
              placeholder="e.g. Mock Test 1"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Duration (mins)
              </label>
              <input
                type="number"
                min={1}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Total Marks
              </label>
              <input
                type="number"
                min={1}
                value={totalMarks}
                onChange={(e) => setTotalMarks(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Passing Marks
              </label>
              <input
                type="number"
                min={0}
                value={passingMarks}
                onChange={(e) => setPassingMarks(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
              />
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Sections</h2>
                <p className="text-xs text-slate-500">
                  Split into Quant, Reasoning, etc.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addSection}
              >
                + Add Section
              </Button>
            </div>
            {sections.map((section, index) => (
              <div
                key={section.id}
                className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200/80 bg-white/90 p-3 md:grid-cols-6"
              >
                <div className="md:col-span-2">
                  <label className="block text-xs text-slate-500">Name</label>
                  <input
                    type="text"
                    value={section.title}
                    onChange={(e) =>
                      updateSection(index, "title", e.target.value)
                    }
                    className="w-full mt-1 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-slate-500">
                    Description
                  </label>
                  <input
                    type="text"
                    value={section.description || ""}
                    onChange={(e) =>
                      updateSection(index, "description", e.target.value)
                    }
                    className="w-full mt-1 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500">
                    Marks/Q
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={section.marksPerQuestion ?? ""}
                    onChange={(e) =>
                      updateSection(
                        index,
                        "marksPerQuestion",
                        e.target.value === "" ? 0 : Number(e.target.value)
                      )
                    }
                    className="w-full mt-1 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="block text-xs text-slate-500">
                      Negative
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.25}
                      value={section.negativeMarks ?? ""}
                      onChange={(e) =>
                        updateSection(
                          index,
                          "negativeMarks",
                          e.target.value === "" ? 0 : Number(e.target.value)
                        )
                      }
                      className="w-full mt-1 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-red-200 text-red-700 hover:bg-red-50"
                    onClick={() => removeSection(index)}
                  >
                    ×
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            {[
              {
                label: "Instant Results",
                value: instantResults,
                set: setInstantResults,
              },
              {
                label: "Allow Retake",
                value: allowRetake,
                set: setAllowRetake,
              },
              {
                label: "Shuffle Questions",
                value: shuffleQuestions,
                set: setShuffleQuestions,
              },
              {
                label: "Shuffle Options",
                value: shuffleOptions,
                set: setShuffleOptions,
              },
            ].map((opt) => (
              <label
                key={opt.label}
                className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={opt.value}
                  onChange={(e) => opt.set(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 bg-white text-primary-600"
                />
                {opt.label}
              </label>
            ))}
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-200">
            <Button type="submit" isLoading={saving} variant="primary">
              Create Test
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
