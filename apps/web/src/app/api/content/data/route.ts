import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import {
    assertTeacherContentAccess,
    isPublicApprovedTeacherContent,
    isPublishedContent,
    toIsoDate,
} from "@/lib/server/classroomAccess";

export const dynamic = "force-dynamic";

const COLLECTION_MAP: Record<string, string> = {
    test: "tests",
    contest: "contests",
    course: "courses",
};

function serializeDoc(doc: FirebaseFirestore.DocumentSnapshot) {
    const data = doc.data() || {};
    return {
        id: doc.id,
        slug: data.slug || doc.id,
        ...data,
        createdAt: toIsoDate(data.createdAt),
        updatedAt: toIsoDate(data.updatedAt),
        startTime: toIsoDate(data.startTime),
        endTime: toIsoDate(data.endTime),
    };
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const slug = searchParams.get("slug");
        const type = searchParams.get("type");
        const teacherId = searchParams.get("teacherId");
        const classId = searchParams.get("classId");
        const parentId = searchParams.get("parentId"); // for subcollections like tests/{seriesId}/tests

        if (parentId && type === "test") {
            const seriesSnap = await adminDb.collection("tests").doc(parentId).get();
            if (!seriesSnap.exists) {
                return NextResponse.json({ error: "Test series not found" }, { status: 404 });
            }

            const seriesData = seriesSnap.data() || {};
            if (teacherId || classId) {
                const access = await assertTeacherContentAccess(req, seriesData, teacherId, { classId });
                if (!access.allowed) {
                    return NextResponse.json({ error: access.error }, { status: access.status });
                }
            } else if (!isPublishedContent(seriesData) || (seriesData.teacherId && !isPublicApprovedTeacherContent(seriesData))) {
                return NextResponse.json({ error: "Test series not found" }, { status: 404 });
            }

            // Load tests inside a test series (subcollection: tests/{parentId}/tests)
            const childId = searchParams.get("childId");

            if (childId) {
                // Load a single test + its questions
                const testSnap = await adminDb
                    .collection("tests")
                    .doc(parentId)
                    .collection("tests")
                    .doc(childId)
                    .get();

                if (!testSnap.exists) {
                    return NextResponse.json({ error: "Test not found" }, { status: 404 });
                }

                const questionsSnap = await adminDb
                    .collection("tests")
                    .doc(parentId)
                    .collection("tests")
                    .doc(childId)
                    .collection("questions")
                    .orderBy("order", "asc")
                    .get();

                const questions = questionsSnap.docs.map((qDoc) => {
                    const qData = qDoc.data() || {};
                    // Return the full question doc so code questions retain their
                    // language list, starters, scoring config, etc. The attempt
                    // page reads `supportedLanguages` / `starters` directly.
                    return {
                        id: qDoc.id,
                        testId: childId,
                        ...qData,
                    };
                });

                return NextResponse.json({ test: serializeDoc(testSnap), questions });
            }

            // Load all tests in a series
            const testsSnap = await adminDb
                .collection("tests")
                .doc(parentId)
                .collection("tests")
                .get();

            const tests = testsSnap.docs.map(serializeDoc);
            return NextResponse.json({ tests });
        }

        if (!slug || !type) {
            return NextResponse.json({ error: "slug and type required" }, { status: 400 });
        }

        const collection = COLLECTION_MAP[type];
        if (!collection) {
            return NextResponse.json({ error: "Invalid type" }, { status: 400 });
        }

        let docSnap: FirebaseFirestore.DocumentSnapshot | null = null;

        const directSnap = await adminDb.collection(collection).doc(slug).get();
        if (directSnap.exists) {
            docSnap = directSnap;
        } else {
            const querySnap = await adminDb
                .collection(collection)
                .where("slug", "==", slug)
                .limit(1)
                .get();
            if (!querySnap.empty) {
                docSnap = querySnap.docs[0];
            }
        }

        if (!docSnap || !docSnap.exists) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const rawData = docSnap.data()!;
        const data: Record<string, any> = rawData || {};

        if (teacherId || classId) {
            const access = await assertTeacherContentAccess(req, data, teacherId, { classId });
            if (!access.allowed) {
                return NextResponse.json({ error: access.error }, { status: access.status });
            }
        } else if (!isPublishedContent(data) || (data.teacherId && !isPublicApprovedTeacherContent(data))) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        return NextResponse.json({ content: serializeDoc(docSnap) });
    } catch (error: any) {
        console.error("Content data API error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to load content" },
            { status: 500 }
        );
    }
}
