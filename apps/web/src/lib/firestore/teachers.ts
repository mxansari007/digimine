"use client";

import {
    collection,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    Timestamp,
    type DocumentData,
} from "firebase/firestore";
import { db } from "../firebase/client";
import type { Teacher, CreateTeacherInput, UpdateTeacherInput, TeacherSubscription } from "@digimine/types";

const teachersCollection = collection(db, "teachers");

function toDate(value: any): Date {
    if (!value) return new Date();
    if (typeof value.toDate === "function") return value.toDate();
    if (typeof value === "string") return new Date(value);
    if (value.seconds !== undefined) return new Date(value.seconds * 1000);
    return value instanceof Date ? value : new Date(value);
}

function mapDoc(snapshot: DocumentData): Teacher {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        ...data,
        profile: data.profile || {},
        subscription: data.subscription
            ? {
                  ...data.subscription,
                  startedAt: toDate(data.subscription.startedAt),
                  expiresAt: toDate(data.subscription.expiresAt),
                  gracePeriodEndsAt: data.subscription.gracePeriodEndsAt
                      ? toDate(data.subscription.gracePeriodEndsAt)
                      : null,
              }
            : null,
        usage: data.usage || {
            currentStudents: 0,
            currentTests: 0,
            currentQuizzes: 0,
            currentContests: 0,
            currentCourses: 0,
            currentQuestions: 0,
            totalEarnings: 0,
            pendingPayout: 0,
        },
        payoutDetails: data.payoutDetails || {
            upiId: null,
            bankAccount: null,
            paypalEmail: null,
        },
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
    } as Teacher;
}

export async function getTeacher(teacherId: string): Promise<Teacher | null> {
    const snapshot = await getDoc(doc(teachersCollection, teacherId));
    if (!snapshot.exists()) return null;
    return mapDoc(snapshot);
}

export async function createTeacher(
    teacherId: string,
    input: CreateTeacherInput
): Promise<Teacher> {
    const now = Timestamp.now();
    const teacherData: Omit<Teacher, "id"> = {
        userId: input.userId,
        profile: {
            name: input.profile.name || "",
            institute: input.profile.institute || "",
            phone: input.profile.phone || "",
            bio: input.profile.bio || "",
            avatarUrl: input.profile.avatarUrl || null,
            subjects: input.profile.subjects || [],
        },
        subscription: {
            planId: "free",
            status: "free",
            startedAt: now.toDate(),
            expiresAt: now.toDate(),
            gracePeriodEndsAt: null,
            autoRenew: false,
        },
        usage: {
            currentStudents: 0,
            currentTests: 0,
            currentQuizzes: 0,
            currentContests: 0,
            currentCourses: 0,
            currentQuestions: 0,
            totalEarnings: 0,
            pendingPayout: 0,
        },
        payoutDetails: {
            upiId: null,
            bankAccount: null,
            paypalEmail: null,
        },
        isVerified: false,
        createdAt: now.toDate(),
        updatedAt: now.toDate(),
    };

    const ref = doc(teachersCollection, teacherId);
    await setDoc(ref, JSON.parse(JSON.stringify(teacherData)));
    return { id: teacherId, ...teacherData };
}

export async function updateTeacher(
    teacherId: string,
    input: UpdateTeacherInput
): Promise<void> {
    const ref = doc(teachersCollection, teacherId);
    const updateData: Record<string, any> = {
        updatedAt: Timestamp.now(),
    };

    if (input.profile) {
        updateData.profile = input.profile;
    }
    if (input.payoutDetails) {
        updateData.payoutDetails = input.payoutDetails;
    }

    await updateDoc(ref, updateData);
}

export async function updateTeacherSubscription(
    teacherId: string,
    subscription: TeacherSubscription
): Promise<void> {
    const ref = doc(teachersCollection, teacherId);
    await updateDoc(ref, {
        subscription: JSON.parse(JSON.stringify(subscription)),
        updatedAt: Timestamp.now(),
    });
}

export async function updateTeacherUsage(
    teacherId: string,
    usage: Partial<Teacher["usage"]>
): Promise<void> {
    const ref = doc(teachersCollection, teacherId);
    await updateDoc(ref, {
        usage: JSON.parse(JSON.stringify(usage)),
        updatedAt: Timestamp.now(),
    });
}
