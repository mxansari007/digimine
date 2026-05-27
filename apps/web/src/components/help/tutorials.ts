/**
 * Per-page tutorial copy. Centralised so non-engineers can update wording
 * in one place, and pages stay clean of long copy blocks.
 *
 * Each step has a question + answer + optional bullets + optional
 * `target` (CSS selector). When `target` is set, the interactive tour
 * spotlights that element and the animated cursor flies to it. When
 * omitted, the popover renders centered with no anchor — useful for
 * Welcome/Wrap-up cards.
 *
 * The selectors below use `[data-tour="..."]` attributes added to the
 * pages, which makes them resilient against UI restyling — any other
 * stable selector works too (e.g. an existing test id or aria label).
 */
import type { TutorialStep } from "./HelpTutorial";

interface TutorialEntry {
    pageKey: string;
    label?: string;
    steps: TutorialStep[];
}

export const TUTORIALS = {
    // ─── Institute portal ─────────────────────────────────────────────

    institute_dashboard: {
        pageKey: "institute-dashboard",
        label: "Institute portal guide",
        steps: [
            {
                eyebrow: "Welcome",
                question: "What is the institute portal?",
                answer:
                    "This is your command center. The left sidebar maps to a stage of running your institute — Teachers, Classes, Question Bank, Content, Billing, Settings.",
            },
            {
                question: "Start with your teachers",
                answer:
                    "Click 'Teachers' in the sidebar to add your faculty in bulk. Existing accounts get linked instantly; new emails get a one-time setup link.",
                target: 'a[href="/institute/teachers"]',
            },
            {
                question: "Then create your classes",
                answer:
                    "Once teachers are in, jump to Classes to create sections (e.g. 610-A) and assign subjects + teachers per class.",
                target: 'a[href="/institute/classes"]',
            },
            {
                question: "How do students join?",
                answer:
                    "Each class has its own invite code. Share the code or join link with students — once they sign up, they're automatically in that class's roster.",
            },
        ],
    } as TutorialEntry,

    institute_teachers: {
        pageKey: "institute-teachers",
        label: "Teacher management guide",
        steps: [
            {
                eyebrow: "Welcome",
                question: "Add your teachers in bulk",
                answer:
                    "Paste a list of emails — one per line, or comma/space separated. Up to 200 at a time. Each email gets one of three outcomes returned to you.",
            },
            {
                question: "Paste your email list here",
                answer:
                    "Drop one email per line into this textarea. The page counts valid addresses as you type so you know what'll be processed.",
                target: '[data-tour="bulk-emails-textarea"]',
                bullets: [
                    "Anita's account exists → silently attached",
                    "Brand-new email → pending invite with a claim link",
                    "Student account → skipped with a clear reason",
                ],
            },
            {
                question: "Click here to send the batch",
                answer:
                    "After clicking, you'll see per-row outcomes. For 'invited' rows, a 'Copy link' button gives you the one-time URL to share with the teacher.",
                target: '[data-tour="bulk-submit"]',
            },
            {
                question: "Track everyone in the roster",
                answer:
                    "This table is the source of truth. Pending claims show 'Copy link' so you can re-share. Active members can be Removed (and later Reinstated).",
                target: '[data-tour="teacher-roster"]',
            },
            {
                question: "Mind the seat limit",
                answer:
                    "Your plan caps how many teachers (active + invited) can be on the institute. The cards at the top show your usage — bulk requests over the cap get partially accepted and the rest flagged as 'skipped'.",
            },
        ],
    } as TutorialEntry,

    institute_students: {
        pageKey: "institute-students",
        label: "Student management guide",
        steps: [
            {
                eyebrow: "Welcome",
                question: "Pre-register your student cohort",
                answer:
                    "Paste a list of student emails. Anyone who already has a student account gets attached instantly; brand-new emails sit in a pending list and auto-attach to your institute the moment they sign up with that email.",
            },
            {
                question: "Paste your email list here",
                answer:
                    "One email per line, or separated by commas / spaces. The counter below shows how many valid addresses were detected — duplicates and invalid formats are skipped silently.",
                target: '[data-tour="bulk-students-textarea"]',
                bullets: [
                    "Existing student → silently attached",
                    "Brand-new email → pre-registered, auto-attaches on signup",
                    "Teacher / admin account → skipped with a reason",
                ],
            },
            {
                question: "Click here to add the batch",
                answer:
                    "After submitting, you'll see a per-row outcome panel — green for attached, amber for pre-registered, grey for skipped. Up to 500 emails per batch.",
                target: '[data-tour="bulk-students-submit"]',
            },
            {
                question: "Track everyone in the roster",
                answer:
                    "Active = student has signed up and is linked to your institute. Pending = pre-registered, waiting for them to sign up. Use Remove to take someone off the roster.",
                target: '[data-tour="student-roster"]',
            },
            {
                question: "How does the magic 'auto-attach' work?",
                answer:
                    "When a brand-new user signs up with an email that's pre-registered here, our signup hook scans across all institutes' pre-registrations, finds the match, and stamps your institute on their account — no invite code needed.",
            },
        ],
    } as TutorialEntry,

    institute_class_detail: {
        pageKey: "institute-class-detail",
        label: "Class roster guide",
        steps: [
            {
                eyebrow: "Welcome",
                question: "Manage this class's students",
                answer:
                    "This is where you add or remove students from one specific class — separate from adding them to the institute as a whole.",
            },
            {
                question: "Where does the student list come from?",
                answer:
                    "From your institute's attached student pool — students who pre-registered or signed up against your institute. If a student isn't in your pool yet, add them on the Students page first.",
            },
            {
                question: "Adding a student",
                answer:
                    "Click 'Add students', then pick from the searchable list. The student lights up in their own dashboard within seconds — no invite code needed.",
                target: '[data-tour="institute-class-roster"]',
            },
            {
                question: "Removing from one class, not the institute",
                answer:
                    "The Remove button here removes the student from THIS class only. They keep their institute attachment and any other class enrollments. To remove someone from the whole institute, use the Students page.",
            },
        ],
    } as TutorialEntry,

    institute_classes: {
        pageKey: "institute-classes",
        label: "Class management guide",
        steps: [
            {
                eyebrow: "Welcome",
                question: "What is a class?",
                answer:
                    "A class is a section (e.g. 610-A). It has multiple subjects, and each subject is taught by a different teacher. Students enrol in the class as a whole and get access to every subject taught in it.",
            },
            {
                question: "Create a new class here",
                answer:
                    "Click 'New class' to create a section. No teacher assignment is needed at creation time — you add subjects + teachers AFTER the class exists.",
                target: '[data-tour="new-class-button"]',
            },
            {
                question: "Add subjects + assign teachers per subject",
                answer:
                    "On every class card, the 'Subjects & teachers' section lets you add a subject with a teacher inline. The same teacher can be assigned to multiple subjects in the same class.",
                target: '[data-tour="subjects-section"]',
                bullets: [
                    "Type a subject name (e.g. 'Mathematics')",
                    "Pick a teacher from the dropdown",
                    "Click Add — the row appears above the form",
                    "Change a subject's teacher anytime via the inline dropdown",
                ],
            },
            {
                question: "Share the invite code with students",
                answer:
                    "Each class card has its own invite code. Click 'Copy' to grab the join link, then share it with your students.",
                target: '[data-tour="invite-code"]',
            },
        ],
    } as TutorialEntry,

    institute_content: {
        pageKey: "institute-content",
        label: "Institute content guide",
        steps: [
            {
                eyebrow: "Welcome",
                question: "Content you publish institute-wide",
                answer:
                    "Quizzes, tests, contests, and courses live here. Unlike teacher-authored content, items here can target many classes at once — every assigned class sees them, and any of its teachers can facilitate.",
            },
            {
                question: "Who can edit?",
                answer:
                    "Institute admins can edit any item in this list, and any teacher you assign to a class the content targets can manage attempts in their class. The same edit forms the teacher portal uses are reused — institute admins are routed through them.",
            },
            {
                question: "Tabs filter by type",
                answer:
                    "Switch tabs to see quizzes, tests, contests, or courses individually. The status chip on each row tells you whether it's a draft, published, or pending review.",
            },
            {
                question: "Target multiple classes",
                answer:
                    "When editing an item, pick one or many classes from the multi-select. Each selected class's roster gets access; teachers assigned to those classes can facilitate without needing to re-author the content.",
            },
        ],
    } as TutorialEntry,

    institute_question_bank: {
        pageKey: "institute-question-bank",
        label: "Institute question bank guide",
        steps: [
            {
                eyebrow: "Welcome",
                question: "A shared question pool",
                answer:
                    "Questions you add here are visible to every teacher in your institute. They can pull from this bank when authoring a quiz or test, saving authoring time and keeping question quality consistent.",
            },
            {
                question: "Tag well — search is your friend",
                answer:
                    "Subject + topic + tags are how teachers find the right questions. A question with good tags gets reused; a question with weak tags rots. Spend the extra minute.",
            },
            {
                question: "Difficulty and marks",
                answer:
                    "Difficulty is shown as a colored chip (green easy, amber moderate, red hard) — it helps teachers build balanced sets quickly. Marks and negative marks are honored exactly when teachers add the question to a quiz.",
            },
            {
                question: "Edits propagate",
                answer:
                    "Editing a question updates it everywhere it's used. If you want to fork a variant for a specific class, copy the question first and edit the copy.",
            },
        ],
    } as TutorialEntry,

    institute_billing: {
        pageKey: "institute-billing",
        label: "Billing guide",
        steps: [
            {
                eyebrow: "Welcome",
                question: "Plan, usage, and invoices in one view",
                answer:
                    "Your current plan, how close you are to its limits, the full invoice history, and your billing contact. Plan changes go through a quick review so we can prorate seats and issue a proper GST invoice.",
            },
            {
                question: "Read the usage bars",
                answer:
                    "Each plan caps teachers, students, and storage. The bars warn when you're close to a limit and turn red when you exceed one. Going over doesn't lock the portal — it triggers a renewal/upgrade conversation.",
            },
            {
                question: "Requesting a plan change",
                answer:
                    "Click 'Request change' on any plan card. Our team responds within 1 business day with a prorated invoice. While a request is pending, the other plan-change buttons are disabled so you don't double-request.",
            },
            {
                question: "Invoices and GST",
                answer:
                    "Every settled payment generates an invoice with your GSTIN (set it on the Billing contact form). Download from the Invoice history table — they're PDFs sized for paper filing.",
            },
        ],
    } as TutorialEntry,

    institute_settings: {
        pageKey: "institute-settings",
        label: "Settings guide",
        steps: [
            {
                eyebrow: "Welcome",
                question: "Identity, contact, branding",
                answer:
                    "How your institute appears to teachers, students, and on shared invite links. Keep these accurate — students see them when they redeem an invite code.",
            },
            {
                question: "Invite code = your front door",
                answer:
                    "Anyone with the institute invite code can request to join. If it leaks, regenerate — the new code immediately invalidates the old one. Re-share manually with anyone who still needs to join.",
            },
            {
                question: "Branding (logo, color, tagline)",
                answer:
                    "Optional. Logo and color show on your institute's public pages and on the sign-up flow when students arrive through your invite link. Skipping them is fine; we fall back to the default theme.",
            },
        ],
    } as TutorialEntry,

    // ─── Teacher portal ───────────────────────────────────────────────

    teacher_dashboard: {
        pageKey: "teacher-dashboard",
        label: "Teacher dashboard guide",
        steps: [
            {
                eyebrow: "Welcome",
                question: "What can I do here?",
                answer:
                    "Your dashboard is the launchpad. Sidebar covers your classes, content (quizzes, tests, contests, courses), question bank, and student roster.",
            },
            {
                question: "Create content fast",
                answer:
                    "The Quick Actions row jumps you straight into the create flows. While editing, you'll pick which of your classes the content publishes to.",
                target: '[data-tour="quick-actions"]',
            },
            {
                question: "Manage your classes",
                answer:
                    "Open 'Classes' in the sidebar to see all your classes, their invite codes, and their rosters.",
                target: 'a[href="/teacher/classes"]',
            },
            {
                question: "Judge students at a glance",
                answer:
                    "'All Students' shows your cross-class roster with risk scores. Click into any class for a class-level command center with a 'Needs attention' panel and per-student insights.",
                target: 'a[href="/teacher/students"]',
            },
        ],
    } as TutorialEntry,

    teacher_students: {
        pageKey: "teacher-students",
        label: "Student roster guide",
        steps: [
            {
                eyebrow: "Welcome",
                question: "Every student, one table",
                answer:
                    "All students across every class you own, fully sortable and filterable. The cards on top summarise the headline numbers.",
            },
            {
                question: "Search and filter to focus",
                answer:
                    "Use the toolbar to find specific cohorts. Search by name/email/roll number, filter by status, risk band, or class. Toggle 'inactive 14d+' to surface ghost students.",
                target: '[data-tour="students-filters"]',
            },
            {
                question: "How is 'risk' calculated?",
                answer:
                    "Risk blends average score, recent score trend, content coverage, and how recently the student was active. Higher number = higher risk.",
                bullets: [
                    "Low (0–35): on track",
                    "Medium (36–65): worth a check-in",
                    "High (66–100): needs attention now",
                ],
            },
            {
                question: "Drill into one student",
                answer:
                    "Click any student name or 'View →' to open the full deep-dive: risk reasons, performance trend, topic strengths, activity heatmap, and a private notes section only you can see.",
            },
            {
                question: "Compare two students",
                answer:
                    "Click 'Compare students' above (or 'Compare' on any row) to see two students side-by-side, including head-to-head on shared assignments.",
                target: '[data-tour="compare-students"]',
            },
        ],
    } as TutorialEntry,

    teacher_class_detail: {
        pageKey: "teacher-class-detail",
        label: "Class command-center guide",
        steps: [
            {
                eyebrow: "Welcome",
                question: "Your class command center",
                answer:
                    "Everything you need to judge this class at a glance — summary cards, students who need attention, and a per-row roster with risk + score + coverage.",
            },
            {
                question: "Read the headline insights",
                answer:
                    "Active student count, class average, pass rate, and at-risk count. Anything red here deserves a closer look.",
                target: '[data-tour="class-insight-cards"]',
            },
            {
                question: "Drill into one student",
                answer:
                    "Click any student name in the roster, or the 'View →' link. You get the full deep-dive — risk reasons, performance trend, topic strengths, activity heatmap, private notes.",
                target: '[data-tour="class-roster"]',
            },
            {
                question: "Open the deep analytics view",
                answer:
                    "The 'Deep analytics' button takes you to score-distribution histogram, daily activity heatmap, topic mastery breakdown, and most-missed questions for the class.",
                target: '[data-tour="deep-analytics"]',
            },
        ],
    } as TutorialEntry,

    teacher_class_analytics: {
        pageKey: "teacher-class-analytics",
        label: "Deep analytics guide",
        steps: [
            {
                eyebrow: "Welcome",
                question: "Everything beneath the surface",
                answer:
                    "The class command-center gives you 'who needs attention'. This page tells you 'why' — score distribution, day-by-day activity, topic mastery, and the questions students miss most.",
            },
            {
                question: "Spot grading distribution at a glance",
                answer:
                    "The score histogram clusters every completed attempt into bands. A peak on the left means your class is struggling; a tight peak on the right means the content might be too easy.",
            },
            {
                question: "Find topic blind spots",
                answer:
                    "The topic mastery breakdown shows which categories the class is weakest on. Use it to plan a revision session or to tune the next quiz.",
            },
            {
                question: "Find the questions worth rewriting",
                answer:
                    "The 'Most missed' list ranks individual questions by wrong-answer rate. If everyone gets a question wrong, it's usually the question's fault — not the students'.",
            },
        ],
    } as TutorialEntry,

    teacher_student_detail: {
        pageKey: "teacher-student-detail",
        label: "Student deep-dive guide",
        steps: [
            {
                eyebrow: "Welcome",
                question: "One student, all signal",
                answer:
                    "Headline metrics + the reasons behind a risk score, a performance trend chart, topic strengths, activity heatmap, and a private notes pad only you can see.",
            },
            {
                question: "Read the risk reasons",
                answer:
                    "Risk is a 0–100 score blending average score, recent trend, content coverage, and last-active. The 'Why' chip explains what's dragging the number — start there.",
            },
            {
                question: "Compare against the class",
                answer:
                    "The 'vs class average' deltas tell you whether the student is genuinely behind or whether the whole class is struggling on the same content.",
            },
            {
                question: "Leave a private note",
                answer:
                    "Notes are visible only to you. Use them to track conversations, intervention plans, or one-off context that doesn't belong in the public roster.",
            },
        ],
    } as TutorialEntry,

    teacher_content: {
        pageKey: "teacher-content",
        label: "Content guide",
        steps: [
            {
                eyebrow: "Welcome",
                question: "Everything you've authored, in one place",
                answer:
                    "Quizzes, tests, contests, and courses you own — filter by status (draft, pending review, published) and tab between content types.",
            },
            {
                question: "Status badges tell you what's live",
                answer:
                    "Draft = visible only to you. Pending review = waiting on admin. Published = live to your classes. Rejected = needs a fix; check the rejection reason in the row.",
            },
            {
                question: "Assign to classes",
                answer:
                    "Click 'Classes' on any item to choose which of your classes can attempt it. The same item can publish to one class or many.",
            },
            {
                question: "Create new content",
                answer:
                    "Use the Quick Actions on the dashboard, or the New button on this page. The create flow always lets you pick the class(es) before publishing.",
            },
        ],
    } as TutorialEntry,

    teacher_question_bank: {
        pageKey: "teacher-question-bank",
        label: "Question bank guide",
        steps: [
            {
                eyebrow: "Welcome",
                question: "Your reusable question library",
                answer:
                    "Every question you've authored lives here — tag, search, filter by type/difficulty/topic, and reuse across multiple quizzes and tests.",
            },
            {
                question: "Filter to find a specific cohort",
                answer:
                    "Use the toolbar to narrow by type (single, multi, true/false, etc.), difficulty (easy, medium, hard), and topic. Combine filters to find exactly what you need.",
            },
            {
                question: "Import in bulk via Markdown",
                answer:
                    "The 'Import' button accepts a Markdown file in our schema and creates questions in one shot — faster than the form for large sets. Hover the button for the schema example.",
            },
            {
                question: "Edit safely",
                answer:
                    "Editing a question updates it everywhere it's used. If you're worried about breaking past attempts, duplicate first and edit the copy instead.",
            },
        ],
    } as TutorialEntry,

    teacher_earnings: {
        pageKey: "teacher-earnings",
        label: "Earnings guide",
        steps: [
            {
                eyebrow: "Welcome",
                question: "Where your money flows",
                answer:
                    "Total earnings, what's pending, and what's available to withdraw. Earnings come from paid enrolments in your published content.",
            },
            {
                question: "Minimum payout is ₹1,000",
                answer:
                    "Payouts kick in once your available balance reaches ₹1,000. Below that, the balance keeps rolling forward. The request button enables automatically.",
            },
            {
                question: "Set your payout details first",
                answer:
                    "Add at least one method — UPI, bank account, or PayPal — before requesting a payout. We process within 5–7 business days.",
            },
            {
                question: "Pending vs available",
                answer:
                    "Pending = earnings in the 14-day refund window. Available = settled and ready. Refunds during the window reverse pending amounts before they settle.",
            },
        ],
    } as TutorialEntry,

    teacher_subscribe: {
        pageKey: "teacher-subscribe",
        label: "Subscription guide",
        steps: [
            {
                eyebrow: "Welcome",
                question: "Pick the plan that fits how you teach",
                answer:
                    "Free gets you the basics. Paid plans unlock larger class sizes, more content slots, and advanced analytics. Toggle monthly vs annual — annual saves ~17%.",
            },
            {
                question: "What stays the same on Free",
                answer:
                    "You can always create classes, invite students, build content, and run a question bank. Free is a sustainable home — not a 30-day trial.",
            },
            {
                question: "What Pro adds",
                answer:
                    "Higher caps (students per class, content slots), the comparison + deep analytics views, CSV exports, and priority support.",
            },
            {
                question: "Cancel anytime",
                answer:
                    "Pro is monthly or yearly, no minimum commitment. Cancelling drops you back to Free at the end of the current cycle — your data stays.",
            },
        ],
    } as TutorialEntry,

    teacher_join_institute: {
        pageKey: "teacher-join-institute",
        label: "Join an institute guide",
        steps: [
            {
                eyebrow: "Welcome",
                question: "Why join an institute?",
                answer:
                    "When you join, the institute admin can assign you to classes and subjects centrally. Your content and analytics stay yours; class management becomes shared.",
            },
            {
                question: "Where do I get the code?",
                answer:
                    "From your institute admin. They generate a one-time invite code from their Teachers page. It's short, alphanumeric, and case-insensitive.",
            },
            {
                question: "What changes after joining",
                answer:
                    "Classes the institute creates for you appear in your sidebar automatically. Subjects are assigned per class. You can still create your own classes alongside.",
            },
            {
                question: "Leaving",
                answer:
                    "You can leave from your account settings. Institute-owned classes disappear from your dashboard; your personally-owned classes and content are unaffected.",
            },
        ],
    } as TutorialEntry,
} as const;
