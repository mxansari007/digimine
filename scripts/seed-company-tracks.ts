/**
 * Seed the `companyTracks/{slug}` catalogue — company-wise prep tracks
 * shown at /tracks. Idempotent (merge writes keyed by slug); safe to re-run.
 *
 *   Run: npx tsx scripts/seed-company-tracks.ts
 *
 * `seriesSlugs` reference `tests` series by slug. The TCS track points at the
 * series deployed by scripts/deploy-tcs-mock-tests.ts; the others reference
 * slugs to be created as those packs are authored — the track page degrades
 * gracefully ("mocks being prepared") until the series exist + publish.
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

require("dotenv").config({ path: ".env" });

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!clientEmail || !privateKey) {
    console.error("ERROR: FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be set in .env");
    process.exit(1);
}
if (getApps().length === 0) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}
const db = getFirestore();

type Track = {
    slug: string;
    company: string;
    examName: string;
    tagline: string;
    pattern: { title: string; questions: number; minutes: number; blurb: string }[];
    seriesSlugs: string[];
    seasonNote: string;
    sortOrder: number;
    isActive: boolean;
};

const TRACKS: Track[] = [
    {
        slug: "tcs-nqt",
        company: "TCS",
        examName: "TCS NQT (National Qualifier Test)",
        tagline:
            "India's largest fresher exam. Clear the Foundation section, then push Advanced for the Digital/Prime offer.",
        pattern: [
            { title: "Numerical Ability", questions: 20, minutes: 25, blurb: "Foundation section" },
            { title: "Verbal Ability", questions: 25, minutes: 25, blurb: "Foundation section" },
            { title: "Reasoning Ability", questions: 20, minutes: 25, blurb: "Foundation section" },
            { title: "Advanced Quantitative & Reasoning", questions: 20, minutes: 25, blurb: "Advanced — Digital/Prime eligibility" },
            { title: "Advanced Coding", questions: 2, minutes: 55, blurb: "Two programs, any allowed language" },
        ],
        seriesSlugs: ["tcs-nqt-2026-mock-test-series"],
        seasonNote: "Hiring season: Aug–Dec",
        sortOrder: 1,
        isActive: true,
    },
    {
        slug: "infosys-sp",
        company: "Infosys",
        examName: "Infosys SP & DSE (InfyTQ pattern)",
        tagline:
            "Heavier on puzzles and pseudo-code than most exams. The coding round decides SP vs DSE banding.",
        pattern: [
            { title: "Reasoning Ability", questions: 15, minutes: 25, blurb: "Logical puzzles, data sufficiency" },
            { title: "Mathematical Ability", questions: 10, minutes: 35, blurb: "Quant with stress on speed" },
            { title: "Verbal Ability", questions: 20, minutes: 20, blurb: "Grammar + comprehension" },
            { title: "Pseudo-code", questions: 5, minutes: 10, blurb: "Trace the output" },
            { title: "Puzzle Solving", questions: 4, minutes: 10, blurb: "Crypt-arithmetic style" },
        ],
        seriesSlugs: ["infosys-sp-2026-mock-test-series"],
        seasonNote: "Hiring season: Sep–Jan",
        sortOrder: 2,
        isActive: true,
    },
    {
        slug: "wipro-nlth",
        company: "Wipro",
        examName: "Wipro NLTH (Elite NTH)",
        tagline:
            "Aptitude plus one essay and two coding problems. The online assessment filters hardest on the coding pair.",
        pattern: [
            { title: "Quantitative Aptitude", questions: 16, minutes: 16, blurb: "Arithmetic, algebra, data interpretation" },
            { title: "Logical Reasoning", questions: 14, minutes: 14, blurb: "Series, syllogisms, arrangements" },
            { title: "Verbal Ability", questions: 18, minutes: 18, blurb: "Grammar, vocabulary, RC" },
            { title: "Essay Writing", questions: 1, minutes: 20, blurb: "200–400 words, evaluated for structure" },
            { title: "Coding", questions: 2, minutes: 60, blurb: "Two problems, C/C++/Java/Python" },
        ],
        seriesSlugs: ["wipro-nlth-2026-mock-test-series"],
        seasonNote: "Hiring season: Aug–Nov",
        sortOrder: 3,
        isActive: true,
    },
    {
        slug: "accenture",
        company: "Accenture",
        examName: "Accenture Cognitive & Technical Assessment",
        tagline:
            "Three-stage funnel: cognitive + technical MCQs, then a two-problem coding round, then communication.",
        pattern: [
            { title: "English Ability", questions: 17, minutes: 20, blurb: "Cognitive stage" },
            { title: "Critical Reasoning", questions: 18, minutes: 20, blurb: "Cognitive stage" },
            { title: "Abstract Reasoning", questions: 15, minutes: 10, blurb: "Cognitive stage" },
            { title: "Common Applications & MS Office", questions: 12, minutes: 10, blurb: "Technical stage" },
            { title: "Pseudo-code & Fundamentals", questions: 18, minutes: 20, blurb: "Technical stage" },
            { title: "Coding", questions: 2, minutes: 45, blurb: "Qualifier for the interview round" },
        ],
        seriesSlugs: ["accenture-2026-mock-test-series"],
        seasonNote: "Hiring season: rolling",
        sortOrder: 4,
        isActive: true,
    },
    {
        slug: "cognizant-gencx",
        company: "Cognizant",
        examName: "Cognizant GenC / GenC Next",
        tagline:
            "GenC leans aptitude; GenC Next adds tougher coding. Cutoffs move with the batch — practice both tiers.",
        pattern: [
            { title: "Quantitative Aptitude", questions: 16, minutes: 16, blurb: "GenC stage" },
            { title: "Logical Reasoning", questions: 16, minutes: 16, blurb: "GenC stage" },
            { title: "English Comprehension", questions: 22, minutes: 18, blurb: "GenC stage" },
            { title: "Automata Fix / Code Debugging", questions: 7, minutes: 20, blurb: "Fix broken snippets" },
            { title: "Coding (GenC Next)", questions: 2, minutes: 60, blurb: "Higher package eligibility" },
        ],
        seriesSlugs: ["cognizant-genc-2026-mock-test-series"],
        seasonNote: "Hiring season: Jul–Oct",
        sortOrder: 5,
        isActive: true,
    },
];

async function main() {
    for (const track of TRACKS) {
        const { slug, ...data } = track;
        await db
            .collection("companyTracks")
            .doc(slug)
            .set({ ...data, updatedAt: Timestamp.now() }, { merge: true });
        console.log(`✓ companyTracks/${slug} (${track.company} — ${track.pattern.length} sections)`);
    }
    console.log(`\nSeeded ${TRACKS.length} tracks. Visible at /tracks once deployed.`);
}

main().then(
    () => process.exit(0),
    (e) => {
        console.error(e);
        process.exit(1);
    }
);
