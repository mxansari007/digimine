/**
 * Practice judge — runs a submission against a problem's test cases.
 *
 * Reuses the same execution providers as /api/code/execute (direct child
 * process, self-hosted Piston, or Judge0 CE) via env detection, but with a
 * simple one-shot runner (no teacher queue). SQL is evaluated separately
 * (see judgeSql) using sql.js when available.
 */
import type {
    CodeTestCase,
    PracticeProblem,
    SubmissionVerdict,
} from "@digimine/types";
import { normalizeOutput } from "@digimine/types";
import { executeDirect } from "@/lib/code-executor/direct";

interface RunResult {
    stdout: string;
    stderr: string;
    compileOutput: string;
    exitCode: number;
}

const PISTON_LANGUAGE_MAP: Record<string, { language: string; version: string }> = {
    python: { language: "python", version: "*" },
    javascript: { language: "javascript", version: "*" },
    cpp: { language: "cpp", version: "*" },
    java: { language: "java", version: "*" },
};

const JUDGE0_LANGUAGE_MAP: Record<string, number> = {
    python: 71,
    javascript: 63,
    cpp: 54,
    java: 62,
};

function detectProvider(): "direct" | "piston" | "judge0" {
    const provider = process.env.CODE_EXECUTION_PROVIDER;
    if (provider === "direct" || provider === "piston" || provider === "judge0") return provider;
    const url = process.env.CODE_EXECUTION_URL || process.env.PISTON_URL;
    if (!url) return "judge0";
    if (url.includes("judge0")) return "judge0";
    if (url.includes("piston") || url.endsWith("/api/v2/execute")) return "piston";
    return "judge0";
}

function executeUrl(): string | undefined {
    return process.env.CODE_EXECUTION_URL || process.env.PISTON_URL;
}

async function runWithPiston(language: string, code: string, stdin: string): Promise<RunResult> {
    const url = executeUrl();
    if (!url) throw new Error("CODE_EXECUTION_URL/PISTON_URL not set for Piston provider");
    const lang = PISTON_LANGUAGE_MAP[language];
    if (!lang) throw new Error(`Unsupported language: ${language}`);
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            language: lang.language,
            version: lang.version,
            files: [{ content: code }],
            stdin: stdin || "",
        }),
    });
    if (!res.ok) throw new Error(`Piston error: ${await res.text()}`);
    const data = await res.json();
    const run = data.run || {};
    const compile = data.compile || {};
    return {
        stdout: run.stdout || "",
        stderr: run.stderr || "",
        compileOutput: compile.stderr || compile.output || "",
        exitCode: typeof run.code === "number" ? run.code : run.signal ? -1 : 0,
    };
}

async function runWithJudge0(language: string, code: string, stdin: string): Promise<RunResult> {
    const langId = JUDGE0_LANGUAGE_MAP[language];
    if (!langId) throw new Error(`Unsupported language: ${language}`);
    const base = (process.env.CODE_EXECUTION_URL || "https://ce.judge0.com/submissions").replace(/\/$/, "");
    const toB64 = (s: string) => Buffer.from(s, "utf-8").toString("base64");
    const fromB64 = (s: string | null) => (s ? Buffer.from(s, "base64").toString("utf-8") : "");
    const res = await fetch(`${base}?base64_encoded=true&wait=true`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            language_id: langId,
            source_code: toB64(code),
            stdin: toB64(stdin || ""),
        }),
    });
    if (!res.ok) throw new Error(`Judge0 error: ${await res.text()}`);
    const data = await res.json();
    return {
        stdout: fromB64(data.stdout),
        stderr: fromB64(data.stderr),
        compileOutput: fromB64(data.compile_output),
        exitCode: data.status?.id === 3 ? 0 : data.exit_code ?? -1,
    };
}

export async function runOnce(language: string, code: string, stdin: string): Promise<RunResult> {
    const provider = detectProvider();
    if (provider === "direct") {
        const r = await executeDirect(language, code, stdin);
        return { stdout: r.stdout, stderr: r.stderr, compileOutput: r.compileOutput, exitCode: r.exitCode };
    }
    if (provider === "piston") return runWithPiston(language, code, stdin);
    return runWithJudge0(language, code, stdin);
}

export interface JudgeResult {
    verdict: SubmissionVerdict;
    passedCount: number;
    totalCount: number;
    runtimeMs: number;
    results: Array<{
        index: number;
        passed: boolean;
        isHidden: boolean;
        input?: string;
        expectedOutput?: string;
        actualOutput?: string;
    }>;
}

/**
 * Judge a DSA submission. In "run" mode only the visible (non-hidden)
 * test cases are evaluated; "submit" runs everything.
 */
export async function judgeDsa(
    problem: Pick<PracticeProblem, "testCases">,
    language: string,
    code: string,
    mode: "run" | "submit"
): Promise<JudgeResult> {
    const allCases: CodeTestCase[] = Array.isArray(problem.testCases) ? problem.testCases : [];
    const cases = mode === "run" ? allCases.filter((c) => !c.isHidden) : allCases;

    if (cases.length === 0) {
        return { verdict: "wrong_answer", passedCount: 0, totalCount: 0, runtimeMs: 0, results: [] };
    }

    const started = Date.now();
    let compileFailed = false;
    let runtimeErr = false;
    let timedOut = false;
    let passed = 0;
    const results: JudgeResult["results"] = [];

    for (let i = 0; i < cases.length; i++) {
        const tc = cases[i];
        let run: RunResult;
        try {
            run = await runOnce(language, code, tc.input || "");
        } catch (err: any) {
            run = { stdout: "", stderr: err?.message || "execution failed", compileOutput: "", exitCode: -1 };
        }

        if (run.compileOutput && run.exitCode !== 0 && !run.stdout) compileFailed = true;
        if (/time limit/i.test(run.stderr)) timedOut = true;
        if (run.exitCode !== 0 && run.stderr && !run.compileOutput) runtimeErr = true;

        const actual = normalizeOutput(run.stdout || "");
        const expected = normalizeOutput(tc.expectedOutput || "");
        const ok = actual === expected && run.exitCode === 0;
        if (ok) passed += 1;

        // Only echo I/O for visible cases. Omit (don't set undefined) so the
        // result object is Firestore-safe — Firestore rejects `undefined`.
        const entry: JudgeResult["results"][number] = {
            index: i,
            passed: ok,
            isHidden: tc.isHidden,
        };
        if (!tc.isHidden) {
            entry.input = tc.input ?? "";
            entry.expectedOutput = tc.expectedOutput ?? "";
            entry.actualOutput = (run.stdout || run.stderr || "").slice(0, 4000);
        }
        results.push(entry);
    }

    const runtimeMs = Date.now() - started;
    let verdict: SubmissionVerdict = "accepted";
    if (passed !== cases.length) {
        if (compileFailed) verdict = "compile_error";
        else if (timedOut) verdict = "time_limit_exceeded";
        else if (runtimeErr && passed === 0) verdict = "runtime_error";
        else verdict = "wrong_answer";
    }

    return { verdict, passedCount: passed, totalCount: cases.length, runtimeMs, results };
}

/**
 * Judge a SQL submission. Runs the user's query against the problem's seed
 * schema in an in-memory SQLite (sql.js) and compares the result set to the
 * pre-computed expected rows.
 *
 * sql.js is an OPTIONAL dependency — if it isn't installed we return a clear
 * "pending" verdict so the build stays green and the feature lights up once
 * `pnpm add sql.js` is run in apps/web.
 */
export async function judgeSql(
    problem: Pick<PracticeProblem, "sql">,
    query: string
): Promise<JudgeResult> {
    const ds = problem.sql;
    if (!ds) {
        return { verdict: "wrong_answer", passedCount: 0, totalCount: 1, runtimeMs: 0, results: [] };
    }

    let initSqlJs: any;
    try {
        // Dynamic import keeps sql.js optional at build time. The variable
        // module specifier prevents TS/webpack from resolving it statically,
        // so the build stays green until `sql.js` is actually installed.
        const mod = "sql.js";
        initSqlJs = (await import(/* webpackIgnore: true */ mod)).default;
    } catch {
        return {
            verdict: "pending",
            passedCount: 0,
            totalCount: 1,
            runtimeMs: 0,
            results: [
                {
                    index: 0,
                    passed: false,
                    isHidden: false,
                    actualOutput:
                        "SQL execution engine not installed. Run `pnpm --filter @digimine/web add sql.js` to enable SQL judging.",
                },
            ],
        };
    }

    const started = Date.now();
    try {
        const SQL = await initSqlJs({});
        const db = new SQL.Database();
        db.run(ds.schemaSql);
        const res = db.exec(query);
        const userCols = res[0]?.columns ?? [];
        const userRows: Array<Array<string | number | null>> = res[0]?.values ?? [];

        const norm = (rows: Array<Array<string | number | null>>) => {
            const mapped = rows.map((r) => r.map((c) => (c === null ? "∅" : String(c))).join(""));
            return ds.orderMatters ? mapped : [...mapped].sort();
        };

        const expected = norm(ds.expectedRows);
        const got = norm(userRows);
        const colsMatch =
            userCols.length === ds.expectedColumns.length &&
            userCols.every((c: string, i: number) => c.toLowerCase() === ds.expectedColumns[i]?.toLowerCase());
        const rowsMatch = expected.length === got.length && expected.every((r, i) => r === got[i]);
        const passed = colsMatch && rowsMatch;
        db.close();

        return {
            verdict: passed ? "accepted" : "wrong_answer",
            passedCount: passed ? 1 : 0,
            totalCount: 1,
            runtimeMs: Date.now() - started,
            results: [
                {
                    index: 0,
                    passed,
                    isHidden: false,
                    expectedOutput: `${ds.expectedColumns.join(" | ")} (${ds.expectedRows.length} rows)`,
                    actualOutput: `${userCols.join(" | ")} (${userRows.length} rows)`,
                },
            ],
        };
    } catch (err: any) {
        return {
            verdict: "runtime_error",
            passedCount: 0,
            totalCount: 1,
            runtimeMs: Date.now() - started,
            results: [{ index: 0, passed: false, isHidden: false, actualOutput: err?.message || "SQL error" }],
        };
    }
}
