# Digimine Teacher Portal & Subscription Module — AI Agent Prompt

## 1. Context & Existing Architecture

You are building a **Teacher Portal & Subscription layer** on top of the existing **Digimine** platform. **Do NOT rebuild any existing feature.** Reuse and extend.

### Existing Stack (Already Implemented)
- **Frontend:** Next.js 14 (App Router), Tailwind CSS, shadcn/ui
- **Backend APIs:** Firebase Functions / Firebase Admin SDK (Node.js)
- **Database:** Firestore (NoSQL)
- **Auth:** Firebase Authentication
- **Storage:** Firebase Storage (for images, PDFs, video thumbnails)
- **Existing Modules (Fully Working):**
  - Quiz engine (MCQ, text input, coding)
  - Test Series engine (timed, sectional, scoring)
  - Contest engine (leaderboard, rankings, start/end windows)
  - Course engine (chapters, video/content, progress tracking)
  - Code execution via self-hosted Piston API (Python, C++, Java, JS, SQL via SQLite)
  - Question Bank (CRUD, tagging, search, filter)
  - Admin dashboard (main website admin)

### Your Job
Build the **Teacher Portal**, **Subscription Plans**, **Student Enrollment under Teachers**, **Content Review Pipeline**, and **Teacher Payouts** — all wired into the existing modules above.

---

## 2. Core Requirements

### A. Teacher Subscription Model

Teachers must purchase a subscription to create content and invite students. Implement **3 plans** stored in Firestore (`subscription_plans` collection):

| Plan | Price (monthly) | Max Students | Max Active Tests | Max Active Courses | Max Questions in Bank | Piston Priority | Code Exec Concurrency | Support |
|------|----------------|--------------|------------------|--------------------|----------------------|-----------------|----------------------|---------|
| **Starter** | ₹499 / $6 | 50 | 5 test series + 10 quizzes + 2 contests | 2 courses | 200 questions | Standard | Shared (max 2 concurrent jobs) | Email |
| **Pro** | ₹1,499 / $18 | 300 | 20 test series + 50 quizzes + 10 contests | 10 courses | 2,000 questions | High | Shared (max 5 concurrent jobs) | Priority Email |
| **Institution** | ₹4,999 / $60 | Unlimited | Unlimited everything | Unlimited courses | 10,000 questions | Dedicated lane | Dedicated Piston worker (8 jobs) | Chat + Call |

#### Rules
- Subscription is **per-teacher**, not per-student. Students access teacher content for free once enrolled.
- Plans are billed monthly via **Razorpay** (integrate webhook to update `teachers/{teacherId}/subscription` document).
- On expiry or cancellation, teacher enters a **7-day grace period** where content remains accessible but no new content can be created. After 7 days, teacher content becomes **read-only** for students (they can view past attempts but cannot start new tests).
- Auto-downgrade to **Free (view-only)** if payment fails after grace period.

---

### B. Teacher Identity & Onboarding

- New users signing up select role: `student` or `teacher`.
- Teachers must complete KYC profile: name, institute name, phone verification, profile photo, bio, subjects they teach.
- On first login, redirect to `/teacher/onboarding` → then to `/teacher/subscribe` if no active plan.
- Teacher document path: `teachers/{teacherId}` (linked to `users/{uid}` via `role: "teacher"`).

---

### C. Teacher Portal (Private Dashboard at `/teacher/dashboard`)

Build a Next.js route group `(teacher)` with sidebar navigation.

#### Dashboard Sections

1. **Overview:** Active students count, recent submissions, revenue earned, plan usage bar (students used / limit, storage used / limit).
2. **My Content:** Reuses existing Quiz/Test/Contest/Course APIs but scopes queries to `teacherId`.
   - Create / Edit / Delete / Duplicate quizzes, test series, contests, courses.
   - **Reuse existing question bank** — teacher can pick from their own `questions` subcollection or create new ones.
   - Content created here is **private by default** (only visible to enrolled students of this teacher).
3. **Students:**
   - Invite via email/link (generate unique enrollment link: `digimine.in/join/{teacherId}`).
   - Bulk CSV upload (name, email, roll number).
   - View student progress, per-student analytics, export to CSV.
   - Remove / ban students.
4. **Publish to Main Website:**
   - Any quiz/test/course can be submitted for **public review**.
   - Status flow: `draft` → `submitted_for_review` → `approved` / `rejected` → `published`.
   - Once published, content appears on the main Digimine marketplace and is accessible to **any** student (not just teacher's).
   - Teacher earns **70% revenue** from sales of their published content (Digimine takes 30%).
5. **Earnings:**
   - Dashboard showing total earnings, monthly breakdown, pending payouts.
   - Minimum payout threshold: ₹1,000 / $25.
   - Payout method: UPI / Bank Transfer / PayPal (store in `teacher.payoutDetails`).

---

### D. Student Experience under a Teacher

Students have two contexts:

#### 1. Main Digimine (Public)
- Browse published content from all teachers.
- Purchase individual tests/courses or use free ones.
- Standard student flow (already exists).

#### 2. Teacher Classroom (Private)
- Student enrolls in a teacher's classroom via invite link or teacher-assigned email.
- Firestore path: `teacher_enrollments/{teacherId}/students/{studentId}`.
- Student sees a **"My Teachers"** dropdown in their navbar.
- Selecting a teacher switches the student view to that teacher's private content:
  - `/classroom/{teacherId}/quizzes`
  - `/classroom/{teacherId}/tests`
  - `/classroom/{teacherId}/contests`
  - `/classroom/{teacherId}/courses`
- All existing quiz/test/contest/course player UIs are **reused**; the only difference is the data source filters by `teacherId` and checks enrollment.

#### Rules
- A student can be enrolled under **multiple teachers** simultaneously.
- Student attempts in a teacher classroom are **isolated** from public attempts (different Firestore subcollections or filtered by `context: "teacher_{teacherId}"`).
- Teacher can see **only their own students' results**. Students cannot see other teachers' students' data.

---

### E. Content Review Pipeline (Admin Side)

Extend the existing admin dashboard with a **"Teacher Submissions"** page:

- Admin sees list of content submitted by teachers with status `submitted_for_review`.
- Admin can:
  - **Preview** the full content (render existing quiz/course player in preview mode).
  - **Approve** → moves to `published`, content becomes public, teacher notified.
  - **Reject** → requires reason text, content returns to `draft`, teacher notified.
  - **Feature** → pinned on main homepage carousel.
- Admin can set `price` for paid published content (teacher suggests, admin approves/modifies).
- Firestore trigger: on approval, create a copy in `public_content/{contentId}` with `originalTeacherId` and `revenueShare: 0.70`.

---

### F. Piston Resource Isolation per Teacher Plan

Your existing Piston API runs on a 2 vCPU / 1 GB machine. Add a lightweight **job queue** in Firebase Functions:

- **Starter/Pro teachers:** Jobs go to a shared queue. Max 3 concurrent executions across all shared users.
- **Institution teachers:** Their jobs are tagged with `priority: "dedicated"` and routed to a separate queue with higher concurrency (if you spin a second Piston instance later, route here).
- If Piston is overloaded, return HTTP 202 to the frontend with `jobId`. Frontend polls `/api/execution/status/{jobId}` every 2 seconds.

---

## 3. Firestore Schema Additions

Add these collections/documents alongside existing ones:

### `subscription_plans` (Static Config, Seeded Once)

```json
{
  "id": "starter",
  "name": "Starter",
  "priceINR": 499,
  "priceUSD": 6,
  "limits": {
    "maxStudents": 50,
    "maxTests": 5,
    "maxQuizzes": 10,
    "maxContests": 2,
    "maxCourses": 2,
    "maxQuestions": 200,
    "pistonConcurrency": 2
  },
  "features": ["email_support"]
}
```

### `teachers/{teacherId}`

```json
{
  "userId": "uid_from_auth",
  "profile": {
    "name": "...",
    "institute": "...",
    "phone": "...",
    "bio": "...",
    "avatarUrl": "...",
    "subjects": []
  },
  "subscription": {
    "planId": "pro",
    "status": "active | grace_period | expired | cancelled",
    "startedAt": "timestamp",
    "expiresAt": "timestamp",
    "gracePeriodEndsAt": "timestamp",
    "autoRenew": true
  },
  "usage": {
    "currentStudents": 47,
    "currentTests": 3,
    "currentQuizzes": 8,
    "currentQuestions": 156,
    "totalEarnings": 12500,
    "pendingPayout": 3400
  },
  "payoutDetails": {
    "upiId": "...",
    "bankAccount": {},
    "paypalEmail": "..."
  },
  "isVerified": true,
  "createdAt": "timestamp"
}
```

### `teacher_enrollments/{teacherId}/students/{studentId}`

```json
{
  "studentId": "uid",
  "studentEmail": "...",
  "studentName": "...",
  "rollNumber": "...",
  "enrolledAt": "timestamp",
  "status": "active | banned | removed",
  "totalAttempts": 23,
  "lastActiveAt": "timestamp"
}
```

### `content_metadata/{contentId}` (Extend Existing Docs)

```json
{
  "teacherId": "teacher_123",
  "visibility": "private | submitted_for_review | published | rejected",
  "context": "teacher_classroom",
  "reviewNotes": "...",
  "suggestedPrice": 199,
  "finalPrice": 149,
  "salesCount": 45,
  "revenueGenerated": 6700,
  "teacherEarnings": 4690,
  "submittedForReviewAt": "timestamp",
  "reviewedBy": "admin_uid",
  "reviewedAt": "timestamp"
}
```

### `payouts/{payoutId}`

```json
{
  "teacherId": "...",
  "amount": 3400,
  "status": "pending | processing | completed | failed",
  "method": "upi",
  "initiatedAt": "timestamp",
  "completedAt": "timestamp",
  "transactionId": "..."
}
```

---

## 4. API Endpoints to Build

Reuse existing business logic. These are thin wrappers or extensions:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/teacher/subscribe` | Initiate Razorpay order for plan |
| `POST /api/teacher/webhook/payment` | Verify payment, activate plan |
| `GET /api/teacher/dashboard` | Aggregated stats for teacher dashboard |
| `POST /api/teacher/students/invite` | Send email invite or generate link |
| `POST /api/teacher/students/bulk-upload` | CSV parse → batch write to Firestore |
| `POST /api/teacher/content/submit-for-review` | Set visibility to `submitted_for_review` |
| `GET /api/classroom/{teacherId}/content` | Student fetches teacher's private content (check enrollment) |
| `POST /api/execution/submit` | Extended to accept `teacherId` and route to correct Piston queue |
| `GET /api/execution/status/{jobId}` | Poll for Piston job result |
| `POST /api/admin/review/approve` | Admin approves content + clones to public |
| `POST /api/admin/review/reject` | Admin rejects with reason |
| `POST /api/teacher/payout/request` | Teacher requests payout (check threshold) |

### Critical Middleware
- `requireTeacher`: Verifies `users/{uid}.role === "teacher"` + active subscription.
- `requireEnrollment`: Verifies student is in `teacher_enrollments/{teacherId}/students/{studentId}`.
- `requireAdmin`: Existing admin check.
- `checkPlanLimits`: Before any CREATE operation, check teacher's usage against plan limits.

---

## 5. Frontend Pages to Build

**Reuse ALL existing UI components** (quiz player, test interface, course viewer, leaderboard). Only build new shells.

### Teacher-Side (Protected by `requireTeacher`)
- `/teacher/onboarding` — KYC form
- `/teacher/subscribe` — Plan selection & checkout
- `/teacher/dashboard` — Analytics overview
- `/teacher/content` — Tabs for Quizzes / Tests / Contests / Courses (reuse existing list cards, add "Duplicate", "Submit for Review" buttons)
- `/teacher/questions` — Teacher's private question bank (reuse existing question bank UI, scope to `teacherId`)
- `/teacher/students` — Table with invite modal, CSV upload, analytics
- `/teacher/earnings` — Revenue chart, payout button, transaction history
- `/teacher/content/new` — Reuse existing creation wizards (quiz builder, test builder, course builder). Just pre-fill `teacherId` and `visibility: "private"`.

### Student-Side (Protected by `requireAuth`)
- `/student/classrooms` — List of enrolled teachers
- `/classroom/[teacherId]` — Teacher-branded landing page (teacher name, logo, bio)
- `/classroom/[teacherId]/quizzes` — Reuse public quiz list, filter by teacher + enrollment
- `/classroom/[teacherId]/tests` — Reuse test series list
- `/classroom/[teacherId]/contests` — Reuse contest list
- `/classroom/[teacherId]/courses` — Reuse course list
- `/classroom/[teacherId]/content/[contentId]` — **Reuse existing player pages entirely.** Only the data fetcher changes (adds `teacherId` header).

### Admin-Side (Extend Existing Admin Dashboard)
- `/admin/teacher-submissions` — Review queue table
- `/admin/teacher-submissions/[contentId]` — Preview content in read-only player + Approve/Reject panel
- `/admin/teachers` — Teacher management, payout approval
- `/admin/payouts` — Process and mark payouts complete

---

## 6. Business Logic Rules (Hard Constraints)

1. **Plan Limits are hard enforced at API level.** If a Starter teacher with 5 active tests tries to create test #6, return `403` with message: "Upgrade to Pro to create more tests."
2. **Student enrollment cap is hard enforced.** If 51st student tries to join a Starter teacher, block with: "This classroom is full. Ask your teacher to upgrade."
3. **Teacher content is private until explicitly submitted and approved.** Never leak private teacher content to public APIs.
4. **Published content sales are tracked per-teacher.** Firestore trigger on purchase: increment `content_metadata.salesCount`, `content_metadata.revenueGenerated`, and `teachers/{teacherId}.usage.totalEarnings`.
5. **Payouts are manual/admin-approved.** Teacher requests → Admin processes → Admin marks complete. Do NOT auto-transfer money.
6. **Code execution queue priority:**
   - Institution teachers: `queue = "dedicated"` (process first, higher concurrency)
   - Starter/Pro: `queue = "shared"` (process FIFO, max 3 concurrent)
   - If queue is full, return `202 Accepted` with `jobId`. Frontend shows "Queued..." spinner.

---

## 7. Implementation Phases (Do in This Order)

### Phase 1: Foundation
- Seed `subscription_plans` collection.
- Add `role` field to user auth flow.
- Build `teachers` collection + KYC onboarding page.
- Build subscription checkout + webhook.

### Phase 2: Teacher Content Creation
- Reuse existing content builders. Add `teacherId` and `visibility` fields.
- Build teacher dashboard shell + "My Content" tabs.
- Build teacher question bank (scoped clone of existing).

### Phase 3: Student Enrollment & Classroom
- Build enrollment link system.
- Build `teacher_enrollments` writes.
- Build `/classroom/[teacherId]` routes reusing existing content lists.
- Add "My Teachers" dropdown to student navbar.

### Phase 4: Review Pipeline & Monetization
- Build admin review pages.
- Build "Submit for Review" flow.
- Add public marketplace listing for approved teacher content.
- Add purchase flow for teacher-published content (reuse existing purchase logic, split revenue).

### Phase 5: Piston Queue & Polish
- Build Firebase Functions job queue for Piston.
- Add polling UI for code execution.
- Add teacher earnings dashboard + payout request.
- Add usage bars and limit warnings in teacher UI.

---

## 8. Tech Stack Constraints

- **Do NOT add PostgreSQL or Redis.** Use Firestore for everything. For the Piston job queue, use Firebase Functions with Firestore `jobs` collection as the queue (or Cloud Tasks if available).
- **Do NOT add a new auth system.** Use Firebase Auth.
- **Do NOT rebuild quiz/test/course players.** Reuse 100%.
- **Payment provider:** Use Razorpay. Abstract behind a `paymentProvider` interface.
- **Email invites:** Use Firebase Extensions (Trigger Email) or a simple nodemailer function.

---

## 9. Deliverables Expected from AI Agent

1. **Firestore Security Rules** updated for teacher/student data isolation.
2. **Firebase Functions** for all new API endpoints listed above.
3. **Next.js Route Handlers** (if using App Router) or API routes for Piston proxy.
4. **React Components** for all new pages (teacher dashboard, classroom views, admin review).
5. **Firestore indexes** file for new composite queries.
6. **Environment variables** template for Razorpay keys, Piston URL.
7. **Seed script** for subscription plans.

---

> **End of Prompt.**
