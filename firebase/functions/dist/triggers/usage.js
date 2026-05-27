"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onStudentEnrolled = exports.onQuestionCreated = exports.onCourseCreated = exports.onContestCreated = exports.onTestCreated = exports.onQuizCreated = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
/**
 * Increment teacher usage counters when content is created
 */
exports.onQuizCreated = functions.firestore
    .document("quizzes/{quizId}")
    .onCreate(async (snap) => {
    const data = snap.data();
    if (!data.teacherId)
        return;
    const teacherRef = db.collection("teachers").doc(data.teacherId);
    await teacherRef.update({
        "usage.currentQuizzes": admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
});
exports.onTestCreated = functions.firestore
    .document("tests/{seriesId}")
    .onCreate(async (snap) => {
    const data = snap.data();
    if (!data.teacherId)
        return;
    const teacherRef = db.collection("teachers").doc(data.teacherId);
    await teacherRef.update({
        "usage.currentTests": admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
});
exports.onContestCreated = functions.firestore
    .document("contests/{contestId}")
    .onCreate(async (snap) => {
    const data = snap.data();
    if (!data.teacherId)
        return;
    const teacherRef = db.collection("teachers").doc(data.teacherId);
    await teacherRef.update({
        "usage.currentContests": admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
});
exports.onCourseCreated = functions.firestore
    .document("courses/{courseId}")
    .onCreate(async (snap) => {
    const data = snap.data();
    if (!data.teacherId)
        return;
    const teacherRef = db.collection("teachers").doc(data.teacherId);
    await teacherRef.update({
        "usage.currentCourses": admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
});
exports.onQuestionCreated = functions.firestore
    .document("teachers/{teacherId}/questions/{questionId}")
    .onCreate(async (_snap, context) => {
    const teacherRef = db.collection("teachers").doc(context.params.teacherId);
    await teacherRef.update({
        "usage.currentQuestions": admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
});
exports.onStudentEnrolled = functions.firestore
    .document("teacher_enrollments/{teacherId}/students/{studentId}")
    .onCreate(async (_snap, context) => {
    const teacherRef = db.collection("teachers").doc(context.params.teacherId);
    await teacherRef.update({
        "usage.currentStudents": admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
});
//# sourceMappingURL=usage.js.map