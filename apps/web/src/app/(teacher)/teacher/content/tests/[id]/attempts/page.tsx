"use client";

import { useParams } from "next/navigation";
import { ContentAttemptsView } from "@/components/teacher/ContentAttemptsView";

export default function TeacherTestAttemptsPage() {
    const params = useParams();
    const id = params.id as string;
    return <ContentAttemptsView contentId={id} kind="test" backHref="/teacher/content" />;
}
