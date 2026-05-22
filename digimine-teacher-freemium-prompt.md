# Digimine Teacher Freemium Module — AI Agent Implementation Prompt

## 1. Context & Existing Stack

You are extending the existing **Digimine** platform (Next.js 14 + Firebase/Firestore + Firebase Auth + shadcn/ui + Tailwind CSS). **Do NOT rebuild existing features.** Reuse the existing quiz builder, test builder, contest builder, course builder, and question bank. Only build the **teacher subscription layer**, **student enrollment flow**, **privacy scoping**, and **admin approval pipeline**.

**Existing modules (fully working):**
- Quiz engine, Test Series engine, Contest engine, Course engine
- Firebase Authentication (Google, Email, Phone)
- Firestore database
- Firebase Storage
- Admin dashboard

---

## 2. Goal

Implement a **freemium teacher model** with the following rules:

| Phase | Access |
|-------|--------|
| **Days 0–7** | Free trial. Teacher can create unlimited content and invite students. |
| **Day 7+** | ₹50/month subscription required. If not paid, content becomes **read-only** for students (view past attempts only). Teacher cannot create new content. |
| **After payment** | 30-day active period, auto-renew or manual. |

**Privacy & Approval Rules:**
- All teacher-created content (quizzes, contests, test series, question bank items) is **private by default** (`visibility: "private"`).
- Only students enrolled under that teacher can see private content.
- **Teacher can request content to be made public.** This sends it to an **admin review queue**.
- **Admin approves or rejects** the request. If approved, content becomes `visibility: "public"` and appears on the main Digimine marketplace.
- If rejected, content returns to `visibility: "private"` with admin feedback.
- **Question bank items** also follow this flow: teacher adds questions → private by default → can request public → admin approves → becomes part of global question bank.

---

## 3. Teacher Onboarding & Anti-Abuse

Teachers must complete these steps before creating content. This prevents multi-account abuse.

### Step 1: Phone OTP Verification
- Use **Firebase Phone Auth**. Teacher must verify phone number.
- Store `phone` in `teachers/{teacherId}`.
- **Block:** If `phone` already exists in any teacher doc with status `trial | active | expired`, redirect to existing account.

### Step 2: Razorpay Pre-Auth (₹1)
- Before trial starts, verify a **UPI ID / Card** via Razorpay.
- Razorpay creates a `fingerprint` token (not the raw UPI ID).
- Store `subscription.paymentFingerprint`.
- **Block:** If this fingerprint is already linked to an **active or trial** teacher account, reduce trial to **3 days** (or require immediate ₹50 payment — your choice).

### Step 3: Profile
- Collect: name, institute name, subjects taught, short bio.
- Auto-generate `inviteCode`: 8-character alphanumeric (e.g., `TEACH_ABC123`).

### Step 4: Trial Activation
- Create `teachers/{teacherId}` doc with:
  - `subscription.status: "trial"`
  - `subscription.trialEndsAt: now + 7 days` (or 3 days if payment fingerprint reused)
  - `subscription.planPrice: 50`
  - `subscription.paymentFingerprint: "..."`
  - `inviteCode: "TEACH_..."`
  - `stats: { totalStudents: 0, totalQuizzes: 0, totalTests: 0, totalContests: 0, totalCourses: 0 }`

---

## 4. Student Enrollment Flow

Students do NOT sign up as "a teacher's student." They sign up as normal Digimine students, then **join a teacher's classroom**.

### Method A: Invite Link (Primary)
Teacher dashboard shows:
```
Invite Students
Link: digimine.in/join/TEACH_ABC123
[Copy Link] [Regenerate]
```

**Student clicks `digimine.in/join/{inviteCode}`:**
1. Find teacher by `inviteCode`.
2. If student already enrolled (`teacher_enrollments/{teacherId}/students/{studentId}` exists), redirect to `/classroom/{teacherId}`.
3. Show confirmation: "Join [Teacher Name]'s Classroom?"
4. On confirm, write enrollment doc + increment `teachers/{teacherId}.stats.totalStudents`.

### Method B: Teacher Adds by Email
Teacher enters student email in `/teacher/students`.
- If student exists in Firebase Auth → auto-enroll + send notification.
- If not exists → send email with signup link containing `?teacherInvite=TEACH_ABC123`.

### Method C: Student Enters Code Manually
Student visits `/student/classrooms` → clicks "Join with Code" → types `TEACH_ABC123` → enrolled.

---

## 5. Content Privacy & Admin Approval Model

### Default State
When a teacher creates content via existing builders, **automatically inject**:

```javascript
{
  teacherId: "uid_of_teacher",
  visibility: "private",        // Always private for teacher content
  reviewStatus: "draft",        // draft | pending_review | approved | rejected
  reviewNotes: "",              // Admin feedback if rejected
  submittedForReviewAt: null,
  reviewedBy: null,
  reviewedAt: null,
  // ... all existing fields
}
```

### Teacher Actions on Content

| Action | Visibility | reviewStatus | Who Can See |
|--------|-----------|--------------|-------------|
| **Create** | `private` | `draft` | Teacher + enrolled students only |
| **Submit for Review** | `private` | `pending_review` | Teacher (read-only) + Admin review queue |
| **Admin Approves** | `public` | `approved` | Everyone on main marketplace |
| **Admin Rejects** | `private` | `rejected` | Teacher + enrolled students only. Teacher sees `reviewNotes` |
| **Teacher Edits Rejected** | `private` | `draft` | Teacher can edit and re-submit |

### Question Bank Flow
- Teacher adds questions to **their private question bank** (`questions` collection with `teacherId`).
- Teacher can select questions and **"Submit to Global Bank"** → goes to admin review.
- Admin approves → question becomes part of **global question bank** (`visibility: "public"`, `reviewStatus: "approved"`).
- Admin rejects → stays in teacher's private bank with feedback.

### Admin Review Queue
- Admin sees all content with `reviewStatus: "pending_review"`.
- Can preview full content in read-only mode (reuse existing player components).
- Can approve, reject with notes, or request changes.
- On approval, content is cloned/moved to public collections with `originalTeacherId` preserved.

---

## 6. Firestore Schema Additions

### `teachers/{teacherId}`
```json
{
  "userId": "uid_from_auth",
  "phone": "+91...",
  "profile": {
    "name": "...",
    "institute": "...",
    "subjects": ["..."],
    "bio": "...",
    "avatarUrl": "..."
  },
  "subscription": {
    "status": "trial | active | grace_period | expired",
    "trialEndsAt": "timestamp",
    "currentPeriodStart": "timestamp",
    "currentPeriodEnd": "timestamp",
    "planPrice": 50,
    "paymentFingerprint": "razorpay_fingerprint",
    "autoRenew": true
  },
  "stats": {
    "totalStudents": 0,
    "totalQuizzes": 0,
    "totalTests": 0,
    "totalContests": 0,
    "totalCourses": 0
  },
  "inviteCode": "TEACH_ABC123",
  "createdAt": "timestamp"
}
```

### `teacher_enrollments/{teacherId}/students/{studentId}`
```json
{
  "studentId": "uid",
  "studentName": "...",
  "studentEmail": "...",
  "rollNumber": "...",
  "enrolledAt": "timestamp",
  "status": "active | banned | removed",
  "lastActiveAt": "timestamp"
}
```

### Content Collections (Quizzes, Tests, Contests, Courses)
**Extend existing schema with these fields:**
```json
{
  "teacherId": "uid",
  "visibility": "private | public",
  "reviewStatus": "draft | pending_review | approved | rejected",
  "reviewNotes": "Admin feedback here...",
  "submittedForReviewAt": "timestamp",
  "reviewedBy": "admin_uid",
  "reviewedAt": "timestamp",
  "isDeleted": false
}
```

### `questions/{questionId}` (Question Bank)
```json
{
  "teacherId": "uid",
  "visibility": "private | public",
  "reviewStatus": "draft | pending_review | approved | rejected",
  "reviewNotes": "...",
  "submittedForReviewAt": "timestamp",
  "reviewedBy": "admin_uid",
  "reviewedAt": "timestamp",
  "isGlobal": false           // true if approved and part of global bank
}
```

### `teacher_signup_logs/{logId}` (for abuse detection)
```json
{
  "teacherId": "uid",
  "ip": "...",
  "userAgent": "...",
  "timestamp": "timestamp"
}
```

---

## 7. API Endpoints (Firebase Functions / Next.js API)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/teacher/onboard` | Phone verify + payment fingerprint check + create teacher doc |
| `POST /api/teacher/subscribe` | Initiate ₹50 Razorpay payment |
| `POST /api/teacher/webhook/payment` | Verify payment, set `status: active`, extend `currentPeriodEnd` |
| `POST /api/enroll` | Student joins classroom via inviteCode |
| `POST /api/teacher/students/invite-by-email` | Teacher adds student by email |
| `POST /api/teacher/students/ban` | Teacher bans/removes student |
| `POST /api/content/create` | Reuse existing create API, inject `teacherId`, `visibility: "private"`, `reviewStatus: "draft"`. Check subscription status. |
| `POST /api/content/submit-for-review` | Teacher submits content for admin approval. Set `reviewStatus: "pending_review"`, `submittedForReviewAt`. |
| `POST /api/content/withdraw-review` | Teacher withdraws pending submission (back to `draft`). |
| `POST /api/admin/review/approve` | Admin approves. Set `visibility: "public"`, `reviewStatus: "approved"`, clone to public collection. |
| `POST /api/admin/review/reject` | Admin rejects. Set `reviewStatus: "rejected"`, add `reviewNotes`. |
| `POST /api/questions/submit-for-review` | Submit question bank items for global approval. |
| `GET /api/classroom/{teacherId}/content` | Fetch teacher's private content (checks enrollment). |
| `GET /api/admin/review-queue` | Fetch all pending content for admin review. |

### Middleware
- `requireTeacher`: `users/{uid}.role === "teacher"` + subscription not `expired`.
- `requireEnrollment`: Student has doc in `teacher_enrollments/{teacherId}/students/{uid}`.
- `checkTrialOrActive`: Reject content creation if `status === "expired"`.
- `requireAdmin`: `users/{uid}.role === "admin"`.

---

## 8. Complete Web Frontend Pages

Build ALL of the following pages. Reuse existing shadcn/ui components, Tailwind CSS, and existing page layouts. **Do NOT rebuild quiz/test/course players or builders.**

### A. Role Selection (Public)
- **Route:** `/auth/role-select`
- **Components:** Two large cards — "I am a Student" / "I am a Teacher"
- **Flow:** On click, write `users/{uid}.role = "student" | "teacher"`. If teacher, redirect to `/teacher/onboarding`.

### B. Teacher Onboarding Flow (Protected: must have role=teacher)

#### B1. Phone Verification
- **Route:** `/teacher/onboarding/phone`
- **Components:** Phone input (with country code), "Send OTP" button, OTP input, "Verify" button
- **Data:** Write `phone` to `teachers/{uid}` doc. Check for existing phone duplicates before proceeding.
- **Next:** On success, redirect to `/teacher/onboarding/payment`

#### B2. Payment Pre-Auth
- **Route:** `/teacher/onboarding/payment`
- **Components:** UPI ID input OR Razorpay checkout modal, "Verify Payment Method" button
- **Data:** Create Razorpay order for ₹1 (refundable). Store `paymentFingerprint`.
- **Check:** If fingerprint exists on another active/trial teacher → show warning: "Reduced trial (3 days) — this payment method was used before."
- **Next:** On success, redirect to `/teacher/onboarding/profile`

#### B3. Profile Setup
- **Route:** `/teacher/onboarding/profile`
- **Components:** Name input, Institute input, Subjects multi-select (dropdown), Bio textarea, Avatar upload (optional)
- **Data:** Write to `teachers/{uid}.profile`. Auto-generate `inviteCode`.
- **Next:** On submit, create teacher doc with `status: "trial"`, redirect to `/teacher/dashboard`

### C. Teacher Dashboard (Protected: requireTeacher)

#### C1. Main Dashboard
- **Route:** `/teacher/dashboard`
- **Layout:** Sidebar navigation + main content area
- **Components:**
  - **Stats Cards Row:** Total Students | Active Quizzes | Active Tests | Active Courses | Pending Reviews
  - **Trial Banner (conditional):** If `status === "trial"`, show green banner: "X days left in free trial. Subscribe for ₹50/month." with "Subscribe Now" button.
  - **Expired Banner (conditional):** If `status === "expired"`, show red banner: "Your trial expired. Students can view past content but you cannot create new material. Subscribe to continue." with "Pay ₹50" button.
  - **Quick Actions:** "Create Quiz" | "Create Test" | "Create Contest" | "Create Course" | "Invite Students"
  - **Recent Activity:** List of recent student enrollments, recent content created, review status updates

#### C2. My Content (Tabs)
- **Route:** `/teacher/content`
- **Layout:** Tabs — Quizzes | Test Series | Contests | Courses
- **Components:**
  - Each tab reuses existing **content list cards** from public marketplace
  - **Status Badge on each card:** `Draft` (gray) | `Pending Review` (yellow) | `Public` (green) | `Rejected` (red with tooltip showing `reviewNotes`)
  - **Actions per card:**
    - `Draft`: "Edit" | "Duplicate" | "Delete" | "Submit for Review"
    - `Pending Review`: "View" (read-only) | "Withdraw Review"
    - `Rejected`: "Edit" | "View Notes" (modal showing admin feedback) | "Re-submit"
    - `Public`: "View" | "Unpublish" (optional, sets back to draft)
  - **Filter bar:** Search by title, filter by reviewStatus, sort by createdAt
  - **Empty state:** "No quizzes yet. Create your first quiz." with CTA button
- **CTA Button:** "+ Create New [Quiz/Test/Contest/Course]" → redirects to existing builder
- **Builder pages reuse:** `/teacher/content/new?type=quiz`, `/teacher/content/new?type=test`, etc. — **inject `teacherId`, `visibility: "private"`, `reviewStatus: "draft"` before saving.**

#### C3. My Question Bank
- **Route:** `/teacher/questions`
- **Layout:** Same as existing admin question bank (table view + filter sidebar)
- **Scope:** Query `questions` where `createdBy === teacherId`
- **Components:**
  - Search, filter by type/difficulty/tags
  - **Status Badge:** `Private` | `Pending Review` | `Public` | `Rejected`
  - **Bulk Actions:** Select multiple questions → "Submit Selected for Global Bank" button
  - **Per-row Actions:** "Edit" | "Delete" | "Submit for Review"
  - **Rejected Questions:** Show `reviewNotes` in tooltip or expandable row
  - "New Question" button → reuse existing question editor

#### C4. Students Management
- **Route:** `/teacher/students`
- **Components:**
  - **Invite Card (top):** Display `inviteCode` and full link `digimine.in/join/{code}`. "Copy Link" button. "Regenerate Code" button.
  - **Add by Email:** Input field + "Add" button. If user exists → auto-enroll. If not → send invite email.
  - **Students Table:** Columns: Name | Email | Roll Number | Enrolled Date | Status | Actions
  - **Actions per row:** "View Progress", "Ban", "Remove"
  - **Bulk CSV Upload:** "Upload CSV" button → parse name, email, rollNumber → batch enroll.
  - **Export:** "Export to CSV" button.

#### C5. Subscription / Billing
- **Route:** `/teacher/subscribe`
- **States:**
  - **Trial active:** "Your free trial ends on [date]. Subscribe now to keep your classroom active." → Razorpay checkout for ₹50.
  - **Active:** "Subscribed until [date]. Auto-renew is ON/OFF." → Toggle auto-renew, "Cancel" button.
  - **Expired:** "Your subscription expired. Renew now for ₹50/month." → Payment form.
  - **Grace period:** "Payment failed. 3 days grace remaining. Update payment method."
- **Components:** Plan card (₹50/month), payment history table, "Update Payment Method" button

### D. Student Classroom Experience (Protected: requireAuth)

#### D1. Student Navbar Update
- **Component:** Add "My Classrooms" dropdown to existing student navbar
- **Items:** List of enrolled teachers. Click → navigate to `/classroom/{teacherId}`
- **Bottom item:** "Join New Classroom" → opens modal with invite code input

#### D2. Join New Classroom Modal
- **Trigger:** "Join New Classroom" in navbar dropdown OR `/student/classrooms` page
- **Components:** Input field for invite code, "Join" button
- **Flow:** Validate code → show teacher preview → confirm → enroll → redirect to classroom

#### D3. My Classrooms List
- **Route:** `/student/classrooms`
- **Components:** Grid of classroom cards. Each card shows teacher avatar, name, institute, subjects, content counts, "Enter Classroom" button, "Leave Classroom" button.

#### D4. Teacher Classroom Landing
- **Route:** `/classroom/[teacherId]`
- **Layout:** Teacher-branded header (name, institute, bio, avatar) + tabs
- **Tabs:** Quizzes | Test Series | Contests | Courses
- **Each tab:** Reuse existing content list components. Filter by `teacherId` + `visibility: "private"`.
- **Empty state:** "No [quizzes] yet from this teacher."
- **Data fetch:** Verify enrollment exists before rendering. If not enrolled, show "Join Classroom" button.

#### D5. Classroom Content Player Pages
- **Routes:** `/classroom/[teacherId]/quiz/[quizId]`, `/classroom/[teacherId]/test/[testId]`, etc.
- **Implementation:** **Reuse existing player pages entirely.** Create thin wrappers that pass `teacherId` and `classroomContext: true` to existing player components.
- **Data:** Fetch content doc + verify enrollment. If not enrolled, redirect to `/classroom/[teacherId]`.

### E. Public Join Page (Public, redirects if already enrolled)
- **Route:** `/join/[inviteCode]`
- **States:** Loading | Not found | Already enrolled | Valid + not enrolled | Not logged in
- **Valid state:** Show teacher profile card with "Join Classroom" button. On click, enroll → redirect to classroom.

### F. Auth Flow Updates
- **Signup page:** After Firebase Auth signup, redirect to `/auth/role-select`
- **Login page:** If `redirect` query param exists (e.g., from `/join/{code}`), redirect there after login.

### G. Admin Review Dashboard (Protected: requireAdmin)

#### G1. Review Queue
- **Route:** `/admin/review-queue`
- **Layout:** Tabs — Quizzes | Test Series | Contests | Courses | Questions
- **Components:**
  - Table of all `reviewStatus: "pending_review"` items
  - Columns: Title | Type | Teacher Name | Submitted Date | Actions
  - **Actions:** "Preview" | "Approve" | "Reject"
  - **Filter:** By content type, by teacher, by date range
  - **Bulk Actions:** Select multiple → "Approve Selected" | "Reject Selected" (with shared notes)

#### G2. Preview Content (Admin)
- **Route:** `/admin/review-queue/[contentId]`
- **Layout:** Split screen — left side shows content preview, right side shows admin actions
- **Preview:** Render the content using **existing read-only player components** (quiz player, test preview, course outline). No editing allowed.
- **Admin Actions Panel:**
  - "Approve" button → sets `visibility: "public"`, `reviewStatus: "approved"`, clones to public collection
  - "Reject" button → requires `reviewNotes` text area → sets `reviewStatus: "rejected"`, `visibility: "private"`
  - "Request Changes" button (optional) → sets `reviewStatus: "draft"`, adds notes, returns to teacher
  - Teacher info card: name, institute, past approval rate

#### G3. Question Bank Review
- **Route:** `/admin/review-queue/questions`
- **Components:** Table of pending questions. Columns: Question Text | Type | Difficulty | Teacher | Actions
- **Preview:** Expandable row showing full question HTML, options, explanation.
- **Actions:** "Approve to Global Bank" | "Reject with Notes"
- **Approved questions** appear in global question bank with `isGlobal: true`.

---

## 9. Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Teachers: own profile only
    match /teachers/{teacherId} {
      allow read: if true; // Public profile for invite page
      allow create: if request.auth != null && request.auth.uid == teacherId;
      allow update: if request.auth != null && request.auth.uid == teacherId;
    }

    // Enrollments: teacher sees all their students; student sees own enrollment
    match /teacher_enrollments/{teacherId}/students/{studentId} {
      allow read: if request.auth != null 
        && (request.auth.uid == teacherId || request.auth.uid == studentId);
      allow create: if request.auth != null 
        && (request.auth.uid == teacherId || request.auth.uid == studentId);
      allow update: if request.auth != null && request.auth.uid == teacherId;
    }

    // Quizzes: private teacher content only visible to enrolled students
    // Public content visible to everyone
    match /quizzes/{quizId} {
      allow read: if request.auth != null 
        && (
          resource.data.visibility == 'public'
          || resource.data.teacherId == request.auth.uid
          || exists(/databases/$(database)/documents/teacher_enrollments/$(resource.data.teacherId)/students/$(request.auth.uid))
        );
      allow create: if request.auth != null 
        && request.auth.uid == resource.data.teacherId
        && get(/databases/$(database)/documents/teachers/$(request.auth.uid)).data.subscription.status in ['trial', 'active'];
      allow update: if request.auth != null 
        && (
          // Teacher can update their own draft/rejected content
          (resource.data.teacherId == request.auth.uid && resource.data.reviewStatus in ['draft', 'rejected'])
          // Teacher can submit for review or withdraw
          || (resource.data.teacherId == request.auth.uid && request.resource.data.reviewStatus in ['pending_review', 'draft'])
          // Admin can approve/reject
          || (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin' && request.resource.data.reviewStatus in ['approved', 'rejected'])
        );
      allow delete: if request.auth != null && resource.data.teacherId == request.auth.uid;
    }

    // Apply identical rules to /tests/{testId}, /contests/{contestId}, /courses/{courseId}

    // Questions: teacher owns private questions; admin manages global bank
    match /questions/{questionId} {
      allow read: if request.auth != null 
        && (
          resource.data.visibility == 'public'
          || resource.data.teacherId == request.auth.uid
          || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'
        );
      allow create: if request.auth != null 
        && request.auth.uid == resource.data.teacherId;
      allow update: if request.auth != null 
        && (
          (resource.data.teacherId == request.auth.uid && resource.data.reviewStatus in ['draft', 'rejected'])
          || (resource.data.teacherId == request.auth.uid && request.resource.data.reviewStatus == 'pending_review')
          || (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin')
        );
      allow delete: if request.auth != null 
        && (resource.data.teacherId == request.auth.uid || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin');
    }

    // Signup logs: admin only
    match /teacher_signup_logs/{logId} {
      allow read: if request.auth != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
      allow create: if request.auth != null;
    }
  }
}
```

---

## 10. Implementation Order

1. **Role Selection Page** (`/auth/role-select`)
2. **Teacher Onboarding Flow** (`/teacher/onboarding/phone`, `/payment`, `/profile`)
3. **Teacher Dashboard** (`/teacher/dashboard`) with trial/expired banners
4. **Teacher Content Pages** (`/teacher/content`) with review status badges and actions
5. **Teacher Question Bank** (`/teacher/questions`) with submit-to-global flow
6. **Teacher Students Page** (`/teacher/students`) with invite link and table
7. **Teacher Subscribe Page** (`/teacher/subscribe`) with Razorpay
8. **Student Navbar Update** ("My Classrooms" dropdown)
9. **Join Modal + My Classrooms** (`/student/classrooms`)
10. **Classroom Landing** (`/classroom/[teacherId]`)
11. **Classroom Content Players** (`/classroom/[teacherId]/quiz/[quizId]`, etc.)
12. **Public Join Page** (`/join/[inviteCode]`)
13. **Auth Redirect Updates** (role select after signup, redirect param handling)
14. **Admin Review Dashboard** (`/admin/review-queue`, `/admin/review-queue/[contentId]`, question bank review)
15. **Security Rules** + **API Endpoints** + **Payment Webhook**

---

## 11. Key Constraints

- **Never show "Subscribe" before onboarding is complete.** Flow: Signup → Onboarding → Dashboard with trial banner → Paywall at day 7.
- **All teacher content defaults to `private` + `draft`.** No manual toggle needed.
- **Teacher cannot edit content once submitted for review.** Must withdraw first.
- **Teacher cannot create content if `status === "expired"`.** API hard-rejects with 403. Frontend hides "Create" buttons.
- **Students can be enrolled under multiple teachers simultaneously.** No restriction.
- **Do NOT add PostgreSQL, Redis, or new auth systems.** Use Firebase only.
- **Reuse 100% of existing UI components.** No new quiz/test/course players or builders.
- **All new pages must use existing layout** (navbar, sidebar, footer, theme, auth context).
- **Admin review is manual.** No auto-approval. Admin sees full preview before deciding.

---

> **End of Prompt.**
