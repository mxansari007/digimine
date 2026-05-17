"use client";

import Link from "next/link";
import { CourseForm } from "@/components/courses/CourseForm";
import { Button } from "@digimine/ui";

export default function CreateCoursePage() {
    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <Link href="/courses">
                        <Button variant="outline" size="sm" className="mb-3">
                            Back to Courses
                        </Button>
                    </Link>
                    <h1 className="text-2xl font-bold text-gray-900">Create Course</h1>
                    <p className="mt-1 text-gray-500">Build study material with notes, chapters, videos, tests, and quizzes.</p>
                </div>
            </div>
            <CourseForm />
        </div>
    );
}
