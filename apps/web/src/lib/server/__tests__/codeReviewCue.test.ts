import { describe, it, expect, vi } from "vitest";

// aiInterview.ts pulls in adminDb + practice at load; stub so we can import the
// pure cue detector without a live Firestore.
vi.mock("@/lib/firebase/admin", () => ({ adminDb: { collection: vi.fn() } }));
vi.mock("@/lib/server/practice", () => ({ PROBLEMS: "practiceProblems", loadProblemById: vi.fn(), serializeProblemPublic: vi.fn() }));
vi.mock("@/lib/server/aiProvider", () => ({}));

import { detectCodeReviewCue } from "../aiInterview";

describe("detectCodeReviewCue", () => {
    it("fires when the candidate explains what they implemented", () => {
        for (const s of [
            "I've implemented the two-pointer approach",
            "I implemented it using a hash map",
            "I wrote a recursive solution",
            "I used a sliding window here",
            "let me walk you through my solution",
            "here's what I did",
            "my code uses a stack to track brackets",
            "I'm done — can you check it?",
            "I think this works now",
            "does this look right?",
            "is this correct?",
            "can you review my code",
            "take a look at my code",
            "I'm getting an error on the second case",
            "it's not working for the empty input",
            "what do you think of my approach?",
        ]) {
            expect(detectCodeReviewCue(s), s).toBe(true);
        }
    });

    it("stays quiet for plain conversation that isn't about their code", () => {
        for (const s of [
            "Can you explain the problem again?",
            "What's the expected time complexity?",
            "I'm still thinking about the approach",
            "Could you give me a hint?",
            "What does this constraint mean?",
            "",
        ]) {
            expect(detectCodeReviewCue(s), s).toBe(false);
        }
    });
});
