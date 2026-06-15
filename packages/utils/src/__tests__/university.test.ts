import { describe, it, expect } from "vitest";
import {
    acronymOf,
    levenshtein,
    normalizeUniversityName,
    rankUniversityMatches,
    scoreUniversity,
    similarity,
    universitySlug,
    UNIVERSITY_AUTORESOLVE_THRESHOLD,
    UNIVERSITY_SUGGEST_THRESHOLD,
    type RankableUniversity,
} from "@digimine/utils";

describe("normalizeUniversityName", () => {
    it("lowercases, trims, collapses whitespace", () => {
        expect(normalizeUniversityName("  Chandigarh   University ")).toBe("chandigarh university");
    });
    it("strips punctuation to spaces", () => {
        expect(normalizeUniversityName("St. Xavier's College")).toBe("st xavier s college");
    });
    it("strips diacritics", () => {
        expect(normalizeUniversityName("Café")).toBe("cafe");
    });
    it("handles empty / nullish", () => {
        expect(normalizeUniversityName("")).toBe("");
        // @ts-expect-error guarding runtime nullish
        expect(normalizeUniversityName(undefined)).toBe("");
    });
});

describe("acronymOf", () => {
    it("builds an acronym from the significant words", () => {
        expect(acronymOf("Chandigarh University")).toBe("cu");
        expect(acronymOf("Delhi Technological University")).toBe("dtu");
    });
    it("drops stopwords (of/the/and…)", () => {
        expect(acronymOf("Indian Institute of Technology")).toBe("iit");
    });
});

describe("levenshtein + similarity", () => {
    it("identical strings → distance 0, similarity 1", () => {
        expect(levenshtein("abc", "abc")).toBe(0);
        expect(similarity("Chandigarh University", "chandigarh university")).toBe(1);
    });
    it("near-misses (typos) score high", () => {
        expect(similarity("chandigarh universty", "Chandigarh University")).toBeGreaterThan(0.85);
    });
    it("substring typing (prefix) scores high", () => {
        expect(similarity("chandigarh", "Chandigarh University")).toBeGreaterThanOrEqual(0.85);
    });
    it("a different university (only the generic word shared) ranks below a typo of the same name, and never auto-resolves", () => {
        const different = similarity("Anna University", "Chandigarh University");
        const typo = similarity("chandigarh universty", "Chandigarh University");
        expect(different).toBeLessThan(typo);
        expect(different).toBeLessThan(UNIVERSITY_AUTORESOLVE_THRESHOLD);
    });
    it("names with no shared words score low", () => {
        expect(similarity("Anna College", "Bombay Polytechnic")).toBeLessThan(0.5);
    });
});

const CU: RankableUniversity = {
    id: "chandigarh-university",
    name: "Chandigarh University",
    slug: "chandigarh-university",
    shortName: "CU",
    aliases: ["cu", "chandigarh uni"],
    normalizedName: "chandigarh university",
    teacherCount: 3,
};
const LPU: RankableUniversity = {
    id: "lovely-professional-university",
    name: "Lovely Professional University",
    shortName: "LPU",
    aliases: ["lpu"],
    normalizedName: "lovely professional university",
    teacherCount: 1,
};

describe("scoreUniversity", () => {
    it("exact normalized name → score 1 (exact)", () => {
        const r = scoreUniversity("chandigarh university", CU);
        expect(r.matchedOn).toBe("exact");
        expect(r.score).toBe(1);
    });
    it("registered alias → alias match", () => {
        expect(scoreUniversity("chandigarh uni", CU).matchedOn).toBe("alias");
    });
    it("short form 'cu' resolves CU with high confidence", () => {
        expect(scoreUniversity("cu", CU).score).toBeGreaterThanOrEqual(0.95);
    });
    it("typo stays above the suggest threshold", () => {
        expect(scoreUniversity("chandigrah universty", CU).score).toBeGreaterThan(
            UNIVERSITY_SUGGEST_THRESHOLD
        );
    });
});

describe("rankUniversityMatches", () => {
    it("ranks the right university first for an acronym", () => {
        expect(rankUniversityMatches("cu", [LPU, CU])[0].university.id).toBe(CU.id);
    });
    it("auto-resolves an exact name (top is confidently above threshold)", () => {
        const ranked = rankUniversityMatches("Chandigarh University", [LPU, CU]);
        expect(ranked[0].university.id).toBe(CU.id);
        expect(ranked[0].score).toBeGreaterThanOrEqual(UNIVERSITY_AUTORESOLVE_THRESHOLD);
    });
    it("dedups by id and respects the limit", () => {
        expect(rankUniversityMatches("university", [CU, CU, LPU], 1)).toHaveLength(1);
    });
    it("an unrelated query never auto-resolves", () => {
        const ranked = rankUniversityMatches("zzzzzz qqqq", [CU, LPU]);
        expect(ranked.every((r) => r.score < UNIVERSITY_AUTORESOLVE_THRESHOLD)).toBe(true);
    });
});

describe("universitySlug", () => {
    it("produces a url-safe slug", () => {
        expect(universitySlug("Chandigarh University")).toBe("chandigarh-university");
    });
});
