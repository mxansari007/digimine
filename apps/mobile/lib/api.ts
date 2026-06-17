/**
 * API client — the mobile twin of the web app's `teacherFetch`: every call
 * attaches the caller's Firebase ID token as a Bearer header and hits the
 * same Next.js API routes the web app uses.
 */
import { auth } from "./firebase";
import { API_URL } from "./config";

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any) {
    super(body?.error || `Request failed (${status})`);
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T = any>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

// ── Response shapes (mirrored from the web app's serializers) ────────────

export interface DashboardClassroom {
  teacherId: string;
  teacherName: string;
  teacherInstitute?: string;
  teacherAvatar?: string | null;
  inviteCode?: string;
}

export interface DashboardData {
  orders: any[];
  products: { id: string; name: string; type?: string; thumbnailURL?: string | null }[];
  purchasedSeries: { id: string; slug: string; title: string; totalTests?: number; totalQuestions?: number }[];
  classrooms: DashboardClassroom[];
  activeAttempt?: unknown;
}

export interface ProblemSummary {
  id: string;
  slug: string;
  kind: "dsa" | "sql" | string;
  problemNumber: number | null;
  title: string;
  difficulty: "easy" | "medium" | "hard" | string;
  primaryPattern: string;
  tags: string[];
  access: "free" | "premium" | string;
  totalSolved: number;
  totalSubmissions: number;
  isFeatured: boolean;
}

export interface InterviewSessionSummary {
  id: string;
  status: "scheduled" | "in_progress" | "completed" | "abandoned" | "cancelled" | "expired";
  interviewType: string;
  problemTitle: string;
  primaryPattern: string | null;
  difficulty: string;
  readiness: number | null;
  verdict: string | null;
  scheduledAt: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface QuotaUsage {
  key: string;
  limit: number; // -1 = unlimited
  used: number;
  remaining: number;
  period: string;
}

export interface UsageResponse {
  entitlements: {
    planCode: string;
    planName: string;
    isPaid: boolean;
    status?: string;
  };
  usage: QuotaUsage[];
}

export interface WalletResponse {
  balance: number;
  lifetimePurchased: number;
  lifetimeSpent: number;
  transactions: {
    id: string;
    type: string;
    task: string | null;
    amount: number;
    balanceAfter: number;
    note: string | null;
    createdAt: string | null;
  }[];
}

export interface QuizSummary {
  id: string;
  slug: string;
  title: string;
  description?: string;
  shortDescription?: string;
  accessType?: "free" | "premium" | string;
  category?: string;
  tags?: string[];
  timeLimitMinutes?: number;
  /** Classroom content-list calls it `duration`. */
  duration?: number;
  passingPercentage?: number;
  totalQuestions: number;
  totalMarks?: number;
  status?: string;
  isDeleted?: boolean;
  /** Set client-side when the quiz came from one of the student's classes. */
  fromClass?: string;
}

export interface ClassMeeting {
  day: string;
  startTime: string;
  endTime: string;
  room: string | null;
}

export interface EnrolledClass {
  classId: string;
  className: string;
  classDescription?: string;
  inviteCode?: string;
  isArchived?: boolean;
  teacherId: string;
  teacherName: string;
  teacherAvatar?: string | null;
  teacherInstitute?: string;
  // New class model — populated for new classes (null/empty on legacy ones).
  subject?: string | null;
  sectionName?: string | null;
  groupName?: string | null;
  room?: string | null;
  meetings?: ClassMeeting[];
}

/** One flattened cell of the student weekly timetable (/api/student/timetable). */
export interface TimetableEntry {
  classId: string;
  subject: string;
  teacherName: string;
  sectionName: string | null;
  room: string | null;
  day: string;
  startTime: string;
  endTime: string;
}

export interface QuizQuestion {
  id: string;
  type: "mcq" | "text_input" | string;
  questionText: string;
  options?: { id: string; text: string }[];
  marks: number;
  negativeMarks: number;
  difficulty?: string;
  order?: number;
  passage?: string;
}

export interface QuizAnswer {
  questionId: string;
  answer: string;
  timeSpent?: number;
}

export interface QuestionResult {
  questionId: string;
  status: "correct" | "wrong" | "skipped";
  selectedAnswer: string;
  correctOptionIds?: string[];
  correctAnswer?: string;
  explanation?: string;
  earnedMarks: number;
  questionMarks: number;
  negativeMarks: number;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  status: "in_progress" | "completed" | "timed_out" | "abandoned";
  startedAt: string;
  completedAt?: string;
  endTime?: string;
  currentQuestionIndex: number;
  answers: QuizAnswer[];
  totalScore: number;
  maxPossibleScore: number;
  correctAnswers: number;
  wrongAnswers: number;
  skipped: number;
  percentage: number;
  passed?: boolean | null;
  passingPercentage?: number;
  questionResults?: QuestionResult[];
  remainingTime?: number;
}

export interface QuizSubmitResult {
  score: number;
  maxScore: number;
  percentage: number;
  correct: number;
  wrong: number;
  skipped: number;
  totalQuestions: number;
  passed: boolean | null;
  passingPercentage: number;
  questionResults: QuestionResult[];
}

export interface TestSectionResult {
  title: string;
  score: number;
  maxScore: number;
  cutoffMarks?: number;
  passed?: boolean;
}

/** A graded mock-test attempt (testAttempts doc, mirrored from the web serializer). */
export interface TestAttempt {
  id: string;
  seriesId?: string;
  title?: string;
  status: "in_progress" | "completed" | "timed_out" | "abandoned" | string;
  totalScore?: number;
  maxPossibleScore?: number;
  correctAnswers?: number;
  wrongAnswers?: number;
  unattempted?: number;
  percentage?: number;
  passed?: boolean;
  sectionResults?: TestSectionResult[];
  answers?: { questionId: string; selectedOptionId?: string; isCorrect?: boolean; marksObtained?: number }[];
  startedAt?: string | null;
  completedAt?: string | null;
  endTime?: string | null;
}

export interface ProblemDetail extends ProblemSummary {
  statementHtml: string;
  secondaryPatterns?: string[];
  samples?: { input: string; expectedOutput: string; explanation: string | null }[];
  constraintsHtml?: string | null;
  hints?: string[];
  /** Official editorial/solution HTML — null when premium-gated for this user. */
  editorialHtml?: string | null;
  editorialAccess?: "free" | "premium" | string;
  /** True when the editorial exists but is locked behind premium. */
  editorialLocked?: boolean;
  locked?: boolean;
  sql?: { schemaSql: string } | null;
}

export interface ProblemProgress {
  status: "todo" | "solved" | "attempted" | string;
  attempts: number;
  solvedAt: string | null;
}

export interface InterviewScorecard {
  dimensions: Record<string, number>;
  correctness: number;
  readiness: number;
  fillerWords: number;
  strengths: string[];
  improvements: string[];
  notes: string;
  verdict: string | null;
  passedCount: number;
  totalCount: number;
}

/** Light row shape shared by every classroom content lane (page-data API). */
export interface ClassContentRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  totalQuestions: number;
  totalTests: number;
  totalMarks: number;
  duration: number;
  timeLimitMinutes: number;
  estimatedHours: number;
  totalModules: number;
  totalLessons: number;
  difficulty: string | null;
  category: string | null;
  startTime: string | null;
  endTime: string | null;
  createdAt: string | null;
}

export interface ClassProjectEvalRow {
  id: string;
  title: string;
  brief?: string;
  techStack?: string | null;
  maxTotalScore?: number;
  status?: string;
  dueAt?: string | null;
  /** The signed-in student's own submission, if any. */
  mySubmission?: {
    status?: string;
    totalScore?: number | null;
    repoUrl?: string;
    [k: string]: any;
  } | null;
}

export interface ClassPageData {
  class: {
    id: string;
    teacherId: string;
    name: string;
    description: string | null;
    inviteCode: string;
    studentsCount: number;
    activeStudentsCount: number;
    isArchived: boolean;
    createdAt: string | null;
  };
  teacher: {
    id: string;
    profile: {
      /** Seeded/teacher-dashboard profiles use `name`. */
      name?: string;
      fullName?: string;
      displayName?: string;
      institute?: string;
      avatarUrl?: string | null;
      [k: string]: any;
    };
    subjects: string[];
  };
  enrolled: boolean;
  counts: Record<"quizzes" | "tests" | "contests" | "courses" | "projectEvals", number>;
  content: {
    quizzes: ClassContentRow[];
    tests: ClassContentRow[];
    contests: ClassContentRow[];
    courses: ClassContentRow[];
    projectEvals: ClassProjectEvalRow[];
  };
}

export interface CourseSubtopic {
  id: string;
  title: string;
  summary?: string;
  contentHtml: string;
  imageUrls: string[];
  videos: { id: string; title: string; url: string }[];
  order?: number;
}

export interface CourseChapter {
  id: string;
  title: string;
  description?: string;
  order?: number;
  subtopics: CourseSubtopic[];
}

export interface CourseDetail {
  id: string;
  slug: string;
  title: string;
  description?: string;
  estimatedHours?: number;
  difficulty?: string;
  totalModules?: number;
  totalLessons?: number;
  chapters: CourseChapter[];
}

export type ThreadTag = "question" | "discussion" | "resource" | "announcement";

export interface ClassThread {
  id: string;
  classId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  authorRole: "student" | "teacher" | "institute_admin" | string;
  title: string;
  body: string;
  attachments: { url?: string; [k: string]: any }[];
  tag: ThreadTag | string;
  upvoteCount: number;
  replyCount: number;
  isPinned: boolean;
  isLocked: boolean;
  lastActivityAt: string | null;
  createdAt: string | null;
  myVote?: boolean;
}

export interface ThreadReply {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  authorRole: string;
  body: string;
  attachments: { url?: string; [k: string]: any }[];
  upvoteCount: number;
  isAnswer: boolean;
  createdAt: string | null;
  myVote?: boolean;
}

/** Per-member moderation flags ("muted in discussions" etc.). */
export interface ThreadBlock {
  threads?: boolean;
  [k: string]: any;
}

// ── Class resource library ───────────────────────────────────────────────

export type ResourceKind = "document" | "video" | "image" | "link";

export interface ClassResource {
  id: string;
  classId: string;
  uploaderId: string;
  uploaderName: string;
  uploaderAvatar: string | null;
  uploaderRole: "student" | "teacher" | "institute_admin" | string;
  title: string;
  description: string;
  kind: ResourceKind | string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
  isPinned: boolean;
  createdAt: string | null;
}

/** Payload for sharing a resource — either an uploaded file or a link. */
export interface CreateResourceInput {
  title: string;
  description?: string;
  /** File upload shape. */
  fileUrl?: string;
  storagePath?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  /** Link shape. */
  link?: string;
}

// ── Messaging + notifications ─────────────────────────────────────────────

export interface DmConversation {
  id: string;
  otherId: string;
  otherName: string;
  otherAvatar: string | null;
  otherRole: "student" | "teacher" | "institute_admin" | string;
  lastMessage: { text: string; senderId: string; at: string | null } | null;
  unread: number;
  blockedByMe: boolean;
  blockedByOther: boolean;
  isBlocked: boolean;
  updatedAt: string | null;
}

export interface DmMessage {
  id: string;
  senderId: string;
  text: string;
  createdAt: string | null;
}

export interface ClassMember {
  id: string;
  role: "student" | "teacher" | string;
  name: string;
  avatarUrl: string | null;
  headline: string | null;
  college: string | null;
  gradYear: number | null;
  skills: string[];
  block?: { threads: boolean; dm: boolean };
}

export interface ClassMembersResponse {
  me: string;
  viewerRole: string;
  members: ClassMember[];
}

export type AppNotificationType =
  | "dm"
  | "announcement"
  | "thread_reply"
  | "answer_marked"
  | "report"
  | "resource_shared"
  | string;

export interface AppNotification {
  id: string;
  type: AppNotificationType;
  title: string;
  body: string;
  data: Record<string, any>;
  actorId: string | null;
  actorName: string | null;
  read: boolean;
  createdAt: string | null;
}

/** Per-category notification toggles (true = notify). */
export interface NotificationPrefs {
  dm: boolean;
  announcement: boolean;
  thread_reply: boolean;
  answer_marked: boolean;
  resource_shared: boolean;
}
export type NotificationPrefKey = keyof NotificationPrefs;

export interface InviteLookup {
  class: {
    id: string;
    teacherId: string;
    name: string;
    description: string | null;
    inviteCode: string;
    studentsCount: number;
    isArchived: boolean;
  } | null;
  teacher: { id: string; profile: { fullName?: string; displayName?: string; institute?: string; [k: string]: any } } | null;
  /** Group invite codes (GRP-…) preview — joining enrolls in all the section's subjects. */
  group?: {
    id: string;
    name: string;
    sectionName: string;
    classCount: number;
    subjects: string[];
  } | null;
}

export interface InterviewSessionDetail {
  id: string;
  status: string;
  interviewType: string;
  problemTitle: string;
  primaryPattern: string | null;
  difficulty: string;
  transcript: { role: string; kind: string; content: string; at: string }[];
  scorecard: InterviewScorecard | null;
  scheduledAt: string | null;
  startedAt: string;
  completedAt: string | null;
}

// ── Teacher portal ────────────────────────────────────────────────────────

export interface TeacherStats {
  totalStudents: number;
  totalQuizzes: number;
  totalTests: number;
  totalCourses: number;
  totalContests: number;
  totalSubmissions: number;
  totalEarnings: number;
  pendingPayout: number;
}

export interface TeacherClass {
  id: string;
  name: string;
  subject?: string | null;
  sectionName?: string | null;
  groupNames?: string[];
  description?: string | null;
  inviteCode?: string;
  studentsCount?: number;
  activeStudentsCount?: number;
  isArchived?: boolean;
  instituteId?: string | null;
  teacherId?: string;
  teacherIds?: string[];
}

export interface StudentRisk {
  score: number;
  band: "low" | "medium" | "high" | string;
  reasons: string[];
}

export interface WeakTopic {
  category: string;
  attempts: number;
  avgPercentage: number;
}

export interface OverviewStudentStats {
  totalAttempts: number;
  completedAttempts: number;
  inProgressAttempts: number;
  averagePercentage: number | null;
  bestPercentage?: number | null;
  completedContentCount: number;
  coveragePercent: number;
  lastActiveAt: string | null;
}

export interface OverviewStudent {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  rollNumber: string | null;
  status: string;
  isPending: boolean;
  enrolledAt: string | null;
  stats: OverviewStudentStats;
  risk: StudentRisk;
  weakTopics: WeakTopic[];
  sparkline: number[];
}

export interface ClassOverview {
  class: {
    id: string;
    name: string;
    description: string | null;
    inviteCode: string;
    isArchived: boolean;
    studentsCount: number;
    activeStudentsCount: number;
    createdAt: string | null;
  };
  insights: {
    totalAssignedContent: number;
    activeStudents: number;
    rosterCount: number;
    studentsWithData: number;
    classAverage: number;
    passRate: number;
    atRiskCount: number;
  };
  students: OverviewStudent[];
  needsAttention: OverviewStudent[];
  notStarted: OverviewStudent[];
}

export interface LeaderEntry {
  studentId: string;
  studentName: string;
  averagePercentage: number | null;
  completedAttempts: number;
}

export interface ClassAnalytics {
  totals: {
    totalStudents: number;
    activeStudents: number;
    totalAssignedContent: number;
    totalAttempts: number;
    completedAttempts: number;
    classAverage: number;
    classMedian: number;
    classTop: number;
    passRate: number;
  };
  histogram: number[]; // 10 bands (0-10%, …, 90-100%)
  topPerformers: LeaderEntry[];
  bottomPerformers: LeaderEntry[];
  atRisk: { studentId: string; studentName: string; studentEmail: string; risk: StudentRisk; stats: OverviewStudentStats }[];
  topicMastery: { category: string; attempts: number; averagePercentage: number }[];
}

export interface RosterStudent {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  rollNumber: string | null;
  enrolledAt: string | null;
  status: string;
  totalAttempts: number;
  lastActiveAt: string | null;
}

// ── Typed helpers ─────────────────────────────────────────────────────────

// ── Job openings (student map) — mirrors packages/types/src/jobOpening.ts ──
export type JobSource = "internal" | "remotive" | "adzuna" | "jobicy" | string;
export interface JobLocation {
  raw: string;
  city: string | null;
  state: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
}
export interface JobOpening {
  id: string;
  source: JobSource;
  externalId: string | null;
  title: string;
  company: string;
  companyLogo: string | null;
  location: JobLocation;
  remote: boolean;
  type: string | null;
  category: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  descriptionSnippet: string;
  applyUrl: string;
  tags: string[];
  postedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  postedBy: string | null;
  featured?: boolean;
}
export interface StudentJobsResponse {
  jobs: JobOpening[];
  total: number;
  mapped: number;
  remote: number;
  cities: number;
}

// ── Resume (view + download; building happens on the web) ──────────────────
export interface ResumeSummary {
  id: string;
  title: string;
  templateId: string;
  /** Cached overall ATS score for the list card, or null. */
  atsScore: number | null;
  updatedAt: string;
  createdAt: string;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the PDF."));
    reader.onloadend = () => {
      const dataUrl = String(reader.result || "");
      resolve(dataUrl.split(",")[1] || "");
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Render an owned resume to a PDF on the server (authoritative Chrome render)
 * and return it base64-encoded, ready to write to a file + share. The PDF
 * route is a binary POST, so it bypasses the JSON `apiFetch`.
 */
export async function resumePdfBase64(resumeId: string): Promise<string> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${API_URL}/api/resume/pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ resumeId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body);
  }
  return blobToBase64(await res.blob());
}

export const api = {
  dashboard: (userId: string) => apiFetch<DashboardData>(`/api/dashboard?userId=${userId}`),
  resumes: () => apiFetch<{ resumes: ResumeSummary[] }>(`/api/resume`),
  quizzes: () => apiFetch<{ items: QuizSummary[] }>(`/api/catalog/quizzes`),
  myEnrollments: () => apiFetch<{ classes: EnrolledClass[] }>(`/api/classroom/my-enrollments`),
  timetable: () => apiFetch<{ entries: TimetableEntry[] }>(`/api/student/timetable`),
  studentJobs: () => apiFetch<StudentJobsResponse>(`/api/student/jobs`),
  classQuizzes: (classId: string) =>
    apiFetch<{ items: QuizSummary[] }>(`/api/classes/${classId}/content-list?type=quizzes`),
  startQuizAttempt: (quizId: string) =>
    apiFetch<{ attempt: QuizAttempt; questions: QuizQuestion[] }>(
      `/api/quizzes/${quizId}/attempts`,
      { method: "POST", body: JSON.stringify({}) }
    ),
  getQuizAttempt: (attemptId: string) =>
    apiFetch<{ attempt: QuizAttempt; questions: QuizQuestion[] }>(
      `/api/quiz-attempts/${attemptId}`
    ),
  saveQuizProgress: (
    attemptId: string,
    body: { answers?: QuizAnswer[]; remainingTime?: number; currentQuestionIndex?: number }
  ) =>
    apiFetch<{ success: boolean }>(`/api/quiz-attempts/${attemptId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  submitQuizAttempt: (
    attemptId: string,
    body: {
      finalStatus?: "timed_out" | "completed";
      answers: QuizAnswer[];
      remainingTime?: number;
      currentQuestionIndex?: number;
    }
  ) =>
    apiFetch<{ attempt: QuizAttempt; result: QuizSubmitResult }>(
      `/api/quiz-attempts/${attemptId}`,
      { method: "POST", body: JSON.stringify(body) }
    ),
  testAttempt: (attemptId: string) =>
    apiFetch<{ attempt: TestAttempt }>(
      `/api/tests/attempt?attemptId=${encodeURIComponent(attemptId)}`
    ),
  problemDetail: (slug: string) =>
    apiFetch<{ problem: ProblemDetail; progress: ProblemProgress | null }>(
      `/api/practice/problems/${slug}`
    ),
  interviewSession: (id: string) =>
    apiFetch<{ session: InterviewSessionDetail }>(`/api/ai-interview/session/${id}`),
  problems: (params: { difficulty?: string; search?: string; pageSize?: number; page?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.difficulty) q.set("difficulty", params.difficulty);
    if (params.search) q.set("search", params.search);
    q.set("pageSize", String(params.pageSize ?? 50));
    q.set("page", String(params.page ?? 1));
    return apiFetch<{ items: ProblemSummary[]; total?: number; count?: number }>(
      `/api/practice/problems?${q.toString()}`
    );
  },
  interviewSessions: () =>
    apiFetch<{ items: InterviewSessionSummary[]; readiness: { avgReadiness?: number; completed?: number } | null }>(
      `/api/ai-interview/sessions?pageSize=25`
    ),
  // ── Classroom ───────────────────────────────────────────────────────────
  classPageData: (classId: string) =>
    apiFetch<ClassPageData>(`/api/classes/${classId}/page-data`),
  courseDetail: (courseId: string, classId: string) =>
    apiFetch<{ content: CourseDetail }>(
      `/api/classroom/content-detail?type=course&contentId=${courseId}&classId=${classId}`
    ),
  lookupInvite: (code: string) =>
    apiFetch<InviteLookup>(
      `/api/classroom/lookup-invite?inviteCode=${encodeURIComponent(code.trim())}`
    ),
  joinClass: (body: { inviteCode?: string; classId?: string; studentEmail?: string; studentName?: string }) =>
    apiFetch<{
      success: boolean;
      classId?: string;
      teacherId?: string;
      classIds?: string[]; // set when a GROUP code enrolled in several classes
      joined?: string;
      message?: string;
    }>(`/api/classroom/enroll`, { method: "POST", body: JSON.stringify(body) }),
  // ── Class community ─────────────────────────────────────────────────────
  classThreads: (classId: string, opts: { sort?: "active" | "top" | "new"; tag?: string } = {}) => {
    const q = new URLSearchParams();
    if (opts.sort) q.set("sort", opts.sort);
    if (opts.tag) q.set("tag", opts.tag);
    const qs = q.toString();
    return apiFetch<{ threads: ClassThread[]; role: string; block: ThreadBlock }>(
      `/api/classes/${classId}/threads${qs ? `?${qs}` : ""}`
    );
  },
  createThread: (classId: string, body: { title: string; body: string; tag: ThreadTag }) =>
    apiFetch<{ thread: ClassThread }>(`/api/classes/${classId}/threads`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  classThread: (classId: string, threadId: string) =>
    apiFetch<{ thread: ClassThread; replies: ThreadReply[]; role: string; block: ThreadBlock }>(
      `/api/classes/${classId}/threads/${threadId}`
    ),
  voteThread: (classId: string, threadId: string) =>
    apiFetch<{ voted: boolean; upvoteCount: number }>(
      `/api/classes/${classId}/threads/${threadId}`,
      { method: "POST", body: JSON.stringify({}) }
    ),
  replyToThread: (classId: string, threadId: string, body: string) =>
    apiFetch<{ reply: ThreadReply }>(`/api/classes/${classId}/threads/${threadId}/replies`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
  voteReply: (classId: string, threadId: string, replyId: string) =>
    apiFetch<{ voted: boolean; upvoteCount: number }>(
      `/api/classes/${classId}/threads/${threadId}/replies`,
      { method: "PATCH", body: JSON.stringify({ replyId, action: "vote" }) }
    ),
  // ── Class resource library ──────────────────────────────────────────────
  classResources: (classId: string) =>
    apiFetch<{ resources: ClassResource[]; role: string; block: ThreadBlock }>(
      `/api/classes/${classId}/resources`
    ),
  createResource: (classId: string, body: CreateResourceInput) =>
    apiFetch<{ resource: ClassResource }>(`/api/classes/${classId}/resources`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteResource: (classId: string, resourceId: string) =>
    apiFetch<{ ok: boolean }>(`/api/classes/${classId}/resources/${resourceId}`, {
      method: "DELETE",
    }),
  setResourcePin: (classId: string, resourceId: string, action: "pin" | "unpin") =>
    apiFetch<{ ok: boolean; isPinned: boolean }>(
      `/api/classes/${classId}/resources/${resourceId}`,
      { method: "PATCH", body: JSON.stringify({ action }) }
    ),
  // ── Messaging ───────────────────────────────────────────────────────────
  conversations: () => apiFetch<{ conversations: DmConversation[] }>(`/api/dm`),
  openConversation: (recipientId: string) =>
    apiFetch<{ conversation: DmConversation }>(`/api/dm`, {
      method: "POST",
      body: JSON.stringify({ recipientId }),
    }),
  messages: (threadId: string, after?: string | null) =>
    apiFetch<{ conversation: DmConversation; messages: DmMessage[] }>(
      `/api/dm/${threadId}${after ? `?after=${encodeURIComponent(after)}` : ""}`
    ),
  sendMessage: (threadId: string, text: string) =>
    apiFetch<{ message: DmMessage }>(`/api/dm/${threadId}`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  setBlock: (threadId: string, action: "block" | "unblock") =>
    apiFetch<{ conversation: DmConversation }>(`/api/dm/${threadId}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    }),
  reportConversation: (threadId: string, reason: string, details?: string) =>
    apiFetch<{ ok: boolean }>(`/api/dm/${threadId}/report`, {
      method: "POST",
      body: JSON.stringify({ reason, details: details || "" }),
    }),
  classMembers: (classId: string) =>
    apiFetch<ClassMembersResponse>(`/api/classes/${classId}/members`),
  // ── Notifications + devices ─────────────────────────────────────────────
  notifications: () =>
    apiFetch<{ notifications: AppNotification[]; unreadCount: number }>(`/api/notifications`),
  markNotificationsRead: (ids?: string[]) =>
    apiFetch<{ ok: boolean; updated: number }>(`/api/notifications/read`, {
      method: "POST",
      body: JSON.stringify(ids ? { ids } : {}),
    }),
  notificationPrefs: () =>
    apiFetch<{ prefs: NotificationPrefs }>(`/api/notification-prefs`),
  setNotificationPref: (type: NotificationPrefKey, enabled: boolean) =>
    apiFetch<{ prefs: NotificationPrefs }>(`/api/notification-prefs`, {
      method: "PATCH",
      body: JSON.stringify({ type, enabled }),
    }),
  registerDevice: (token: string, platform: string) =>
    apiFetch<{ ok: boolean }>(`/api/devices`, {
      method: "POST",
      body: JSON.stringify({ token, platform }),
    }),
  unregisterDevice: (token: string) =>
    apiFetch<{ ok: boolean }>(`/api/devices`, {
      method: "DELETE",
      body: JSON.stringify({ token }),
    }),
  usage: () => apiFetch<UsageResponse>(`/api/subscription/usage`),
  creditsConfig: () => apiFetch<{ enabled: boolean }>(`/api/credits/config`),
  wallet: () => apiFetch<WalletResponse>(`/api/credits/wallet`),
  // ── Teacher portal ────────────────────────────────────────────────────────
  teacherDashboard: (teacherId: string) =>
    apiFetch<{ stats: TeacherStats; usage: Record<string, any>; subscription: Record<string, any> }>(
      `/api/teacher/dashboard?teacherId=${encodeURIComponent(teacherId)}`
    ),
  teacherClasses: () => apiFetch<{ classes: TeacherClass[] }>(`/api/teacher/classes`),
  classOverview: (classId: string) =>
    apiFetch<ClassOverview>(`/api/teacher/classes/${classId}/overview`),
  classAnalytics: (classId: string) =>
    apiFetch<ClassAnalytics>(`/api/teacher/classes/${classId}/analytics`),
  classRoster: (classId: string) =>
    apiFetch<{ students: RosterStudent[] }>(`/api/teacher/classes/${classId}/students`),
};
