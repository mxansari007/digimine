"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";
import { db } from "../firebase/client";
import type { Contest } from "@digimine/types";

const contestsCollection = collection(db, "contests");

function toDate(value: any): Date | undefined {
  if (!value) return undefined;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "string") return new Date(value);
  if (value.seconds !== undefined) return new Date(value.seconds * 1000);
  return value;
}

function mapDoc<T>(snapshot: DocumentData): T {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    startTime: toDate(data.startTime),
    endTime: toDate(data.endTime),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } as T;
}

export function getContestPhase(
  contest: Contest
): "scheduled" | "live" | "ended" {
  const now = Date.now();
  if (now < contest.startTime.getTime()) return "scheduled";
  if (now < contest.endTime.getTime()) return "live";
  return "ended";
}

function isPublicCatalogContest(
  contest: Contest & { teacherId?: string; visibility?: string }
): boolean {
  // Admin-authored content: no teacherId, just needs status published
  if (!contest.teacherId && contest.status === "published") return true;
  // Teacher-authored content: must have admin-approved visibility
  if (contest.teacherId && contest.visibility === "published") return true;
  return false;
}

export async function getPublishedContests(): Promise<Contest[]> {
  const snapshot = await getDocs(
    query(contestsCollection, where("status", "==", "published"))
  );
  return snapshot.docs
    .map((item) => mapDoc<Contest & { teacherId?: string; visibility?: string }>(item))
    .filter(isPublicCatalogContest)
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
}

export async function getContestById(
  contestId: string
): Promise<Contest | null> {
  const snapshot = await getDoc(doc(contestsCollection, contestId));
  if (!snapshot.exists()) return null;
  const contest = mapDoc<Contest & { teacherId?: string; visibility?: string }>(snapshot);
  return isPublicCatalogContest(contest) ? contest : null;
}

export async function getContestBySlug(slug: string): Promise<Contest | null> {
  const direct = await getContestById(slug);
  if (direct) return direct;

  const snapshot = await getDocs(
    query(
      contestsCollection,
      where("slug", "==", slug),
      where("status", "==", "published")
    )
  );
  const contest = snapshot.docs
    .map((item) => mapDoc<Contest & { teacherId?: string; visibility?: string }>(item))
    .find(isPublicCatalogContest);
  return contest || null;
}
