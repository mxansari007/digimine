/**
 * Bulk import for practice problems.
 *
 * Problems are structured (test cases, starters, SQL schemas) so a JSON
 * array is the right format — far cleaner than markdown frontmatter for
 * this shape. The importer accepts either a bare array or { "problems": [...] }.
 */
import type { CreatePracticeProblemInput } from "@digimine/types";

export interface ProblemsParseResult {
    ok: boolean;
    problems: CreatePracticeProblemInput[];
    errors: string[];
    warnings: string[];
}

const VALID_KINDS = new Set(["dsa", "sql"]);
const VALID_DIFFICULTY = new Set(["easy", "medium", "hard"]);

export function parseProblemsJson(text: string): ProblemsParseResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let raw: any;
    try {
        raw = JSON.parse(text);
    } catch (e: any) {
        return { ok: false, problems: [], errors: [`Invalid JSON: ${e.message}`], warnings };
    }

    const arr: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.problems) ? raw.problems : null;
    if (!arr) {
        return { ok: false, problems: [], errors: ["Expected a JSON array or { \"problems\": [...] }."], warnings };
    }

    const problems: CreatePracticeProblemInput[] = [];
    arr.forEach((p, i) => {
        const label = p?.title || `#${i + 1}`;
        if (!p || typeof p !== "object") {
            errors.push(`Item ${i + 1}: not an object.`);
            return;
        }
        if (!p.title) errors.push(`"${label}": missing title.`);
        if (!VALID_KINDS.has(p.kind)) errors.push(`"${label}": kind must be "dsa" or "sql".`);
        if (!VALID_DIFFICULTY.has(p.difficulty)) errors.push(`"${label}": difficulty must be easy/medium/hard.`);
        if (!p.primaryPattern) errors.push(`"${label}": missing primaryPattern.`);

        if (p.kind === "dsa") {
            if (!Array.isArray(p.testCases) || p.testCases.length === 0) {
                warnings.push(`"${label}": no test cases — it won't be solvable until you add some.`);
            }
        } else if (p.kind === "sql") {
            if (!p.sql || !p.sql.schemaSql) warnings.push(`"${label}": SQL problem missing sql.schemaSql.`);
            if (!p.sql || !Array.isArray(p.sql.expectedRows)) warnings.push(`"${label}": SQL problem missing sql.expectedRows.`);
        }

        // Only push items that cleared the hard checks.
        if (p.title && VALID_KINDS.has(p.kind) && VALID_DIFFICULTY.has(p.difficulty) && p.primaryPattern) {
            problems.push({
                kind: p.kind,
                title: String(p.title),
                slug: p.slug,
                problemNumber:
                    typeof p.problemNumber === "number" ? p.problemNumber : null,
                difficulty: p.difficulty,
                primaryPattern: p.primaryPattern,
                secondaryPatterns: p.secondaryPatterns || [],
                tags: p.tags || [],
                patternChoices: p.patternChoices || [],
                statementHtml: p.statementHtml || p.statement || "",
                constraintsHtml: p.constraintsHtml ?? null,
                editorialHtml: p.editorialHtml ?? null,
                editorialAccess: p.editorialAccess === "premium" ? "premium" : "free",
                hints: Array.isArray(p.hints)
                    ? p.hints.map((h: any, idx: number) => (typeof h === "string" ? { id: `h${idx}`, order: idx, text: h } : { id: h.id || `h${idx}`, order: h.order ?? idx, text: h.text || "" }))
                    : [],
                languages: p.languages || ["python", "javascript", "cpp", "java"],
                starters: p.starters || [],
                testCases: p.testCases || [],
                sql: p.sql ?? null,
                status: p.status || "draft",
                access: p.access || "free",
                isFeatured: Boolean(p.isFeatured),
                timeLimitMs: p.timeLimitMs,
                memoryLimitMb: p.memoryLimitMb,
            });
        }
    });

    return { ok: errors.length === 0, problems, errors, warnings };
}

export const PROBLEM_JSON_TEMPLATE = JSON.stringify(
    {
        problems: [
            {
                kind: "dsa",
                title: "Two Sum",
                slug: "two-sum",
                problemNumber: 1,
                difficulty: "easy",
                primaryPattern: "arrays-hashing",
                patternChoices: ["arrays-hashing", "two-pointers", "sliding-window", "binary-search"],
                tags: ["amazon", "google"],
                statementHtml: "<p>Given an array <code>nums</code> and a target, return indices of the two numbers that add up to target.</p>",
                constraintsHtml: "<p>2 ≤ nums.length ≤ 10^4</p>",
                languages: ["python", "javascript", "cpp", "java"],
                starters: [
                    { language: "python", code: "class Solution:\n    def twoSum(self, nums, target):\n        pass" },
                ],
                testCases: [
                    { id: "t1", input: "4\n2 7 11 15\n9", expectedOutput: "0 1", isHidden: false, explanation: "nums[0]+nums[1]=9" },
                    { id: "t2", input: "3\n3 2 4\n6", expectedOutput: "1 2", isHidden: true },
                ],
                hints: ["Use a hashmap of value → index.", "One pass is enough."],
                editorialHtml: "<p>Store each number's complement in a hashmap…</p>",
                // ── Access gating ─────────────────────────────────────────
                // `access`           — "free" | "login" | "premium"
                //                      "premium" locks the whole problem (statement
                //                      teaser visible, editor + Run/Submit gated).
                // `editorialAccess`  — "free" | "premium"
                //                      Lock JUST the editorial walkthrough behind
                //                      Premium even on a free problem.
                access: "free",
                editorialAccess: "free",
                status: "published",
                isFeatured: false,
            },
            {
                // Premium SQL example — demonstrates a fully Premium-locked
                // problem AND a Premium-locked editorial. Free users see the
                // statement + lock card; subscribers see everything.
                kind: "sql",
                title: "Top Customers",
                slug: "top-customers",
                problemNumber: 2,
                difficulty: "medium",
                primaryPattern: "sql-group-having",
                patternChoices: ["sql-group-having", "sql-joins", "sql-aggregation", "sql-window-functions"],
                tags: ["amazon"],
                statementHtml: "<p>Return customer names with more than 2 orders.</p>",
                sql: {
                    schemaSql: "CREATE TABLE customers (id INT, name TEXT);\nCREATE TABLE orders (id INT, customer_id INT);\nINSERT INTO customers VALUES (1,'A'),(2,'B');\nINSERT INTO orders VALUES (1,1),(2,1),(3,1),(4,2);",
                    solutionSql: "SELECT c.name FROM customers c JOIN orders o ON o.customer_id=c.id GROUP BY c.id HAVING COUNT(*)>2;",
                    orderMatters: false,
                    expectedColumns: ["name"],
                    expectedRows: [["A"]],
                },
                editorialHtml: "<p>GROUP BY the customer table joined with orders, then HAVING COUNT &gt; 2.</p>",
                access: "premium",
                editorialAccess: "premium",
                status: "published",
            },
        ],
    },
    null,
    2
);

export function downloadProblemTemplate(filename = "practice-problems-template.json") {
    if (typeof window === "undefined") return;
    const blob = new Blob([PROBLEM_JSON_TEMPLATE], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
