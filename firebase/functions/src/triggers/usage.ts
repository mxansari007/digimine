import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * Increment teacher usage counters when content is created
 */
export const onQuizCreated = functions.firestore
    .document("quizzes/{quizId}")
    .onCreate(async (snap) => {
        const data = snap.data();
        if (!data.teacherId) return;
        const teacherRef = db.collection("teachers").doc(data.teacherId);
        await teacherRef.update({
            "usage.currentQuizzes": admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    });

export const onTestCreated = functions.firestore
    .document("tests/{seriesId}")
    .onCreate(async (snap) => {
        const data = snap.data();
        if (!data.teacherId) return;
        const teacherRef = db.collection("teachers").doc(data.teacherId);
        await teacherRef.update({
            "usage.currentTests": admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    });

export const onContestCreated = functions.firestore
    .document("contests/{contestId}")
    .onCreate(async (snap) => {
        const data = snap.data();
        if (!data.teacherId) return;
        const teacherRef = db.collection("teachers").doc(data.teacherId);
        await teacherRef.update({
            "usage.currentContests": admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    });

export const onCourseCreated = functions.firestore
    .document("courses/{courseId}")
    .onCreate(async (snap) => {
        const data = snap.data();
        if (!data.teacherId) return;
        const teacherRef = db.collection("teachers").doc(data.teacherId);
        await teacherRef.update({
            "usage.currentCourses": admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    });

export const onQuestionCreated = functions.firestore
    .document("teachers/{teacherId}/questions/{questionId}")
    .onCreate(async (_snap, context) => {
        const teacherRef = db.collection("teachers").doc(context.params.teacherId);
        await teacherRef.update({
            "usage.currentQuestions": admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    });

export const onStudentEnrolled = functions.firestore
    .document("teacher_enrollments/{teacherId}/students/{studentId}")
    .onCreate(async (_snap, context) => {
        const teacherRef = db.collection("teachers").doc(context.params.teacherId);
        await teacherRef.update({
            "usage.currentStudents": admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    });
