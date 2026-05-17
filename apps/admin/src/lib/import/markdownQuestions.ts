import type {
    CreateQuestionInput,
    QuestionType,
    DifficultyLevel,
    CodeLanguage,
    CodeStarter,
    CodeTestCase,
    CodeScoringMode,
    MCQOption,
} from "@digimine/types";

/**
 * Markdown-based question bank format used to bulk-import questions.
 *
 * High-level grammar (whitespace tolerant, case-insensitive keys):
 *
 *   ## Question <N>
 *   type: mcq | code
 *   marks: <number>
 *   negativeMarks: <number, optional>
 *   difficulty: easy | medium | hard
 *   languages: python, javascript, cpp, java   (code only)
 *   timeLimit: <seconds, optional>
 *   memoryLimit: <MB, optional>
 *   scoringMode: all_or_nothing | weighted     (code only)
 *
 *   ? <Question text spanning one or more lines until a blank line>
 *
 *   * [x] <correct option>      (MCQ only)
 *   * [ ] <wrong option>
 *
 *   @starter <language>
 *   <starter code>
 *   @end
 *
 *   @testcase
 *   input: <single-line>     OR   input: |||
 *                                  <multi-line>
 *                                  |||
 *   expected: <single-line>  OR   expected: |||
 *                                  <multi-line>
 *                                  |||
 *   hidden: false
 *   weight: 1
 *   @end
 *
 *   > Explanation: <text>
 */

export type ParseError = { line: number; message: string };

export interface ParseResult {
    questions: CreateQuestionInput[];
    errors: ParseError[];
}

/** Strip surrounding whitespace and BOM. */
function clean(s: string) {
    return s.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

/** Parse a key: value line. Returns null if the line is not a metadata line. */
function parseMeta(line: string): { key: string; value: string } | null {
    const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) return null;
    return { key: m[1].toLowerCase(), value: m[2].trim() };
}

/**
 * Splits the document into question blocks delimited by `## Question` headings.
 * Returns the blocks along with their starting line number in the original document.
 */
function splitQuestionBlocks(text: string): { lines: string[]; startLine: number }[] {
    const allLines = text.split("\n");
    const blocks: { lines: string[]; startLine: number }[] = [];
    let current: { lines: string[]; startLine: number } | null = null;

    for (let i = 0; i < allLines.length; i++) {
        const line = allLines[i];
        if (/^##\s+Question\b/i.test(line.trim())) {
            if (current) blocks.push(current);
            current = { lines: [], startLine: i + 1 };
            continue;
        }
        if (current) current.lines.push(line);
    }
    if (current) blocks.push(current);
    return blocks;
}

function parseBoolean(value: string): boolean {
    const v = value.trim().toLowerCase();
    return v === "true" || v === "yes" || v === "1";
}

function parseList(value: string): string[] {
    return value
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

/** Parse a single question block; pushes any errors to the provided list. */
function parseQuestion(
    block: { lines: string[]; startLine: number },
    questionNumber: number,
    errors: ParseError[]
): CreateQuestionInput | null {
    const { lines, startLine } = block;
    const meta: Record<string, string> = {};
    const textLines: string[] = [];
    const options: { text: string; isCorrect: boolean }[] = [];
    const starters: CodeStarter[] = [];
    const testCases: CodeTestCase[] = [];
    let explanation = "";

    let i = 0;
    // 1. Header metadata (continues until first blank line or first content marker).
    while (i < lines.length) {
        const raw = lines[i];
        const trimmed = raw.trim();
        if (trimmed === "") {
            i++;
            break;
        }
        // Markers that end the metadata block:
        if (
            trimmed.startsWith("?") ||
            trimmed.startsWith("*") ||
            trimmed.startsWith("@") ||
            trimmed.startsWith(">")
        ) {
            break;
        }
        const m = parseMeta(trimmed);
        if (m) meta[m.key] = m.value;
        i++;
    }

    // 2. Remaining body parsing
    while (i < lines.length) {
        const raw = lines[i];
        const trimmed = raw.trim();

        // Question text (one or more lines starting with `?`, or following `?` until blank line)
        if (trimmed.startsWith("?")) {
            // First `?` line - the rest are question continuation until blank/content marker
            textLines.push(trimmed.replace(/^\?\s*/, ""));
            i++;
            while (i < lines.length) {
                const next = lines[i];
                const nt = next.trim();
                if (nt === "") {
                    i++;
                    break;
                }
                if (
                    nt.startsWith("*") ||
                    nt.startsWith("@") ||
                    nt.startsWith(">") ||
                    /^[A-Za-z][A-Za-z0-9_-]*:/.test(nt)
                ) {
                    break;
                }
                textLines.push(nt);
                i++;
            }
            continue;
        }

        // MCQ option
        const optMatch = trimmed.match(/^\*\s*\[(x| )\]\s*(.*)$/i);
        if (optMatch) {
            options.push({
                isCorrect: optMatch[1].toLowerCase() === "x",
                text: optMatch[2].trim(),
            });
            i++;
            continue;
        }

        // @starter <lang> ... @end
        const starterMatch = trimmed.match(/^@starter\s+(\S+)\s*$/i);
        if (starterMatch) {
            const lang = starterMatch[1].toLowerCase() as CodeLanguage;
            i++;
            const codeLines: string[] = [];
            while (i < lines.length && lines[i].trim().toLowerCase() !== "@end") {
                codeLines.push(lines[i]);
                i++;
            }
            if (i >= lines.length) {
                errors.push({ line: startLine + i, message: `Missing @end for @starter ${lang}` });
            } else {
                i++; // consume @end
            }
            starters.push({ language: lang, code: codeLines.join("\n") });
            continue;
        }

        // @testcase ... @end
        if (/^@testcase\s*$/i.test(trimmed)) {
            i++;
            const tcMeta: Record<string, string> = {};
            while (i < lines.length && lines[i].trim().toLowerCase() !== "@end") {
                const tcLine = lines[i];
                const tcTrimmed = tcLine.trim();
                const m = parseMeta(tcTrimmed);
                if (m) {
                    // Multi-line value with ||| delimiter
                    if (m.value === "|||") {
                        i++;
                        const buf: string[] = [];
                        while (i < lines.length && lines[i].trim() !== "|||") {
                            buf.push(lines[i]);
                            i++;
                        }
                        tcMeta[m.key] = buf.join("\n");
                        i++; // consume closing |||
                    } else {
                        tcMeta[m.key] = m.value;
                        i++;
                    }
                } else {
                    i++;
                }
            }
            if (i >= lines.length) {
                errors.push({ line: startLine + i, message: `Missing @end for @testcase` });
            } else {
                i++;
            }
            testCases.push({
                id: "",
                input: tcMeta.input ?? "",
                expectedOutput: tcMeta.expected ?? tcMeta.expectedoutput ?? "",
                isHidden: parseBoolean(tcMeta.hidden ?? "false"),
                weight: Number(tcMeta.weight ?? 1) || 1,
            });
            continue;
        }

        // Explanation
        if (trimmed.toLowerCase().startsWith("> explanation")) {
            const after = trimmed.replace(/^>\s*explanation\s*:?\s*/i, "");
            const buf: string[] = [];
            if (after) buf.push(after);
            i++;
            while (i < lines.length) {
                const nt = lines[i].trim();
                if (nt === "") {
                    i++;
                    break;
                }
                if (nt.startsWith(">")) {
                    buf.push(nt.replace(/^>\s*/, ""));
                } else {
                    buf.push(nt);
                }
                i++;
            }
            explanation = buf.join("\n").trim();
            continue;
        }

        i++;
    }

    // Validation & assembly
    const type = (meta.type || "").toLowerCase() as QuestionType;
    if (type !== "mcq" && type !== "code") {
        errors.push({
            line: startLine,
            message: `Question ${questionNumber}: missing or invalid "type" (must be mcq or code)`,
        });
        return null;
    }
    const questionText = textLines.join("\n").trim();
    if (!questionText) {
        errors.push({
            line: startLine,
            message: `Question ${questionNumber}: missing question text (use a line starting with "?")`,
        });
        return null;
    }
    const marks = Number(meta.marks);
    if (!Number.isFinite(marks) || marks <= 0) {
        errors.push({
            line: startLine,
            message: `Question ${questionNumber}: "marks" must be a positive number`,
        });
        return null;
    }
    const difficulty = (meta.difficulty || "medium").toLowerCase() as DifficultyLevel;
    const negativeMarks = meta.negativemarks ? Number(meta.negativemarks) || 0 : 0;

    if (type === "mcq") {
        if (options.length < 2) {
            errors.push({
                line: startLine,
                message: `Question ${questionNumber}: MCQ requires at least 2 options`,
            });
            return null;
        }
        if (!options.some((o) => o.isCorrect)) {
            errors.push({
                line: startLine,
                message: `Question ${questionNumber}: MCQ must have at least one correct option (mark with [x])`,
            });
            return null;
        }
        return {
            seriesId: "",
            testId: "",
            type: "mcq",
            questionText,
            options: options as Omit<MCQOption, "id">[],
            explanation: explanation || undefined,
            marks,
            negativeMarks,
            difficulty,
        };
    }

    // Code question
    const languages = (meta.languages ? parseList(meta.languages) : ["python"]) as CodeLanguage[];
    if (languages.length === 0) {
        errors.push({
            line: startLine,
            message: `Question ${questionNumber}: code question requires at least one language`,
        });
        return null;
    }
    if (testCases.length === 0) {
        errors.push({
            line: startLine,
            message: `Question ${questionNumber}: code question requires at least one @testcase block`,
        });
        return null;
    }
    // Ensure a starter exists for every supported language
    const startersFinal: CodeStarter[] = languages.map((lang) => {
        const existing = starters.find((s) => s.language === lang);
        return existing ?? { language: lang, code: "" };
    });
    const scoringMode = (meta.scoringmode || "all_or_nothing").toLowerCase() as CodeScoringMode;

    return {
        seriesId: "",
        testId: "",
        type: "code",
        questionText,
        explanation: explanation || undefined,
        marks,
        negativeMarks,
        difficulty,
        supportedLanguages: languages,
        starters: startersFinal,
        testCases,
        codeScoringMode: scoringMode,
        timeLimit: meta.timelimit ? Number(meta.timelimit) || 2 : 2,
        memoryLimit: meta.memorylimit ? Number(meta.memorylimit) || 128 : 128,
    };
}

/**
 * Parse a markdown question bank into CreateQuestionInput[] (without seriesId/testId).
 */
export function parseQuestionsMarkdown(source: string): ParseResult {
    const text = clean(source);
    const blocks = splitQuestionBlocks(text);
    const errors: ParseError[] = [];
    const questions: CreateQuestionInput[] = [];

    if (blocks.length === 0) {
        errors.push({
            line: 1,
            message: 'No questions found. Each question must start with "## Question N".',
        });
        return { questions, errors };
    }

    blocks.forEach((block, idx) => {
        const q = parseQuestion(block, idx + 1, errors);
        if (q) questions.push(q);
    });

    return { questions, errors };
}

/**
 * A documented sample template that admins can download as a starting point.
 */
export const QUESTION_TEMPLATE_MD = `# Question Bank Template
<!--
  HOW TO USE
  - Each question starts with a heading "## Question <N>".
  - Metadata lines (type, marks, difficulty, etc.) appear right below the heading.
  - The question prompt is on lines starting with "?".
  - MCQ options use markdown checkboxes: "* [x] correct" / "* [ ] wrong".
  - Code starters: @starter <language> ... @end.
  - Test cases:   @testcase ... @end (one block per test case).
  - Optional explanation: "> Explanation: ...".
  - Lines starting with <!-- are comments and are ignored visually.
  - Save this file and upload it via "Import Markdown" on the questions page.
-->

## Question 1
type: mcq
marks: 2
negativeMarks: 0
difficulty: easy

? What is the value of 2 + 2?

* [x] 4
* [ ] 3
* [ ] 5
* [ ] 22

> Explanation: Basic arithmetic.


## Question 2
type: mcq
marks: 3
negativeMarks: 1
difficulty: medium

? Which of these are JavaScript primitive types?
? (Select the single best answer.)

* [ ] Array
* [x] String
* [ ] Object
* [ ] Map


## Question 3
type: code
marks: 5
difficulty: hard
languages: python, javascript
timeLimit: 2
memoryLimit: 128
scoringMode: all_or_nothing

? Write a function solve(a, b) that returns the sum a + b.
? The input contains two integers separated by a space.

@starter python
def solve(a, b):
    # Write your code here
    return 0

# Read input
a, b = map(int, input().split())
print(solve(a, b))
@end

@starter javascript
function solve(a, b) {
  // Write your code here
  return 0;
}

const [a, b] = require('fs').readFileSync(0, 'utf8').trim().split(' ').map(Number);
console.log(solve(a, b));
@end

@testcase
input: 1 2
expected: 3
hidden: false
weight: 1
@end

@testcase
input: |||
10
20
|||
expected: |||
30
|||
hidden: true
weight: 2
@end

> Explanation: Just return a + b.
`;

/** Trigger a browser download of the template file. */
export function downloadQuestionTemplate(filename = "question-template.md") {
    const blob = new Blob([QUESTION_TEMPLATE_MD], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
