import { getCachedCourses } from "@/lib/server/catalog";
import CoursesBrowser from "./CoursesBrowser";

// Server-rendered so every course card + link is in the initial HTML
// (crawlable). The catalog query is cached (see lib/server/catalog), so
// per-request load stays flat. Metadata comes from courses/layout.tsx.
export default async function CoursesPage() {
    const courses = await getCachedCourses().catch(() => []);

    return (
        <div className="min-h-screen bg-slate-50">
            <section className="border-b border-slate-200 bg-white py-16">
                <div className="container-page">
                    <div className="max-w-3xl">
                        <p className="text-sm font-black uppercase tracking-[0.16em] text-primary-600">Study material</p>
                        <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
                            Courses, notes, quizzes, and exam prep paths
                        </h1>
                        <p className="mt-4 text-lg leading-8 text-slate-600">
                            Learn through chapter-wise notes, diagrams, embedded videos, attached test series, and topic quizzes.
                        </p>
                    </div>
                </div>
            </section>

            <section className="container-page pb-16 pt-8">
                <CoursesBrowser courses={courses} />
            </section>
        </div>
    );
}
