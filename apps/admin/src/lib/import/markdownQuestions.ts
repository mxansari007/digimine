import type {
    CreateQuestionInput,
    QuestionType,
    DifficultyLevel,
    CodeLanguage,
    CodeStarter,
    CodeTestCase,
    CodeScoringMode,
    MCQOption,
    TestSectionInput,
} from "@digimine/types";

/**
 * Markdown-based question bank format used to bulk-import questions.
 *
 * High-level grammar (whitespace tolerant, case-insensitive keys):
 *
 *   ## Section quant
 *   title: Quantitative Aptitude
 *   marksPerQuestion: 2
 *   negativeMarks: 0.5
 *   cutoffMarks: 10          (optional)
 *
 *   ## Question <N>
 *   type: mcq | code
 *   section: quant           (optional; matches a Section key/title/id)
 *   marks: <number>
 *   negativeMarks: <number, optional>
 *   difficulty: easy | medium | hard
 *   languages: python, javascript, cpp, java   (code only)
 *   timeLimit: <seconds, optional>
 *   memoryLimit: <MB, optional>
 *   scoringMode: all_or_nothing | weighted     (code only)
 *
 *   IMPORTANT — content vs. structure:
 *     The outer file is Markdown only at the *structural* level (headings,
 *     metadata keys, fenced @ blocks). The actual rendered CONTENT of the
 *     question prompt, MCQ options, and explanation is **raw HTML** — the
 *     test UI renders these fields with an HTML renderer (FormattedContent).
 *     Use HTML tags (<h3>, <p>, <ul>/<li>, <pre><code>, <table>, <img>,
 *     <strong>, <em>, …) inside the body blocks below.
 *
 *   Question body — pick ONE of the two forms below:
 *
 *   (A) Short prompt — lines starting with `?` (HTML, joined with newlines).
 *
 *       ? <p>What is the value of <code>2 + 2</code>?</p>
 *
 *   (B) Rich HTML body — full HTML allowed inside the fence (headings,
 *       pre/code blocks, lists, tables, images, …). Captured verbatim.
 *
 *       @question
 *       <h3>Background</h3>
 *       <p>Some context with <code>inline code</code> and an image:</p>
 *       <p><img src="https://example.com/img.png" alt="diagram" /></p>
 *       <h3>Task</h3>
 *       <ol><li>Do this</li><li>Then that</li></ol>
 *       <pre><code class="language-python"># sample snippet</code></pre>
 *       @end
 *
 *   MCQ options (single- or multi-line, content is HTML):
 *
 *       * [x] <correct option in HTML>
 *       * [ ] <wrong option in HTML>
 *       * [x] |||
 *       <p>Multi-line option supporting <strong>HTML</strong>,
 *       lists, and <code>code</code>.</p>
 *       |||
 *
 *   Code starters (raw source code — NOT HTML):
 *
 *       @starter <language>
 *       <starter code, verbatim>
 *       @end
 *
 *   Test cases (input/expected are raw strings — NOT HTML):
 *
 *       @testcase
 *       input: <single-line>     OR   input: |||
 *                                      <multi-line>
 *                                      |||
 *       expected: <single-line>  OR   expected: |||
 *                                      <multi-line>
 *                                      |||
 *       hidden: false
 *       weight: 1
 *       @end
 *
 *   Explanation (HTML) — short or rich:
 *
 *       > Explanation: <p>One-liner with optional <strong>HTML</strong>.</p>
 *
 *     OR
 *
 *       @explanation
 *       <p>Full HTML allowed, including code blocks and images.</p>
 *       @end
 *
 *   Reading-comprehension / logical sets:
 *     Group multiple questions under a single shared passage so they stay
 *     together when shuffle is enabled and the passage is shown above each
 *     member question.
 *
 *       ## Question 1
 *       type: mcq
 *       marks: 1
 *       group: rc-aristotle              <-- shared identifier
 *
 *       @passage                         <-- only the FIRST member needs this
 *       <p>Aristotle, born in 384 BC, ...</p>
 *       @end
 *
 *       ? <p>According to the passage, when was Aristotle born?</p>
 *       * [x] 384 BC
 *       * [ ] 322 BC
 *
 *       ## Question 2
 *       type: mcq
 *       marks: 1
 *       group: rc-aristotle              <-- same group; passage is inherited
 *
 *       ? <p>What is the central theme of the passage?</p>
 *       * [x] ...
 *       * [ ] ...
 */

export type ParseError = { line: number; message: string };

export interface ParsedSection extends TestSectionInput {
    key: string;
}

export interface ParseResult {
    sections: ParsedSection[];
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
        if (/^##\s+Section\b/i.test(line.trim())) {
            if (current) {
                blocks.push(current);
                current = null;
            }
            continue;
        }
        if (current) current.lines.push(line);
    }
    if (current) blocks.push(current);
    return blocks;
}

function slugify(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function parseOptionalNumber(value: string | undefined): number | undefined {
    if (value === undefined || value.trim() === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function parseSectionBlocks(text: string): ParsedSection[] {
    const allLines = text.split("\n");
    const sections: ParsedSection[] = [];

    for (let i = 0; i < allLines.length; i++) {
        const headingMatch = allLines[i].trim().match(/^##\s+Section\b\s*(.*)$/i);
        if (!headingMatch) continue;

        const headingText = headingMatch[1].trim();
        const meta: Record<string, string> = {};
        let j = i + 1;
        while (j < allLines.length && !/^##\s+(Section|Question)\b/i.test(allLines[j].trim())) {
            const m = parseMeta(allLines[j].trim());
            if (m) meta[m.key] = m.value;
            j++;
        }

        const title = (meta.title || headingText).trim();
        const key = slugify(meta.key || meta.id || headingText || title);
        if (title && key) {
            sections.push({
                key,
                id: meta.id || key,
                title,
                description: meta.description?.trim() || undefined,
                order: sections.length,
                marksPerQuestion: parseOptionalNumber(meta.marksperquestion ?? meta.marks),
                negativeMarks: parseOptionalNumber(meta.negativemarks ?? meta.negative),
                cutoffMarks: parseOptionalNumber(meta.cutoffmarks ?? meta.cutoff),
            });
        }

        i = j - 1;
    }

    return sections;
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
    errors: ParseError[],
    groupPassages: Record<string, string>
): CreateQuestionInput | null {
    const { lines, startLine } = block;
    const meta: Record<string, string> = {};
    const textLines: string[] = [];
    const options: { text: string; isCorrect: boolean }[] = [];
    const starters: CodeStarter[] = [];
    const testCases: CodeTestCase[] = [];
    let explanation = "";
    let passage = "";

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
            trimmed.startsWith(">") ||
            trimmed.startsWith("#") ||
            trimmed.startsWith("```")
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

        // Reading-comprehension / logical-set passage: @passage ... @end (HTML, verbatim)
        if (/^@passage\s*$/i.test(trimmed)) {
            i++;
            const buf: string[] = [];
            while (i < lines.length && lines[i].trim().toLowerCase() !== "@end") {
                buf.push(lines[i]);
                i++;
            }
            if (i >= lines.length) {
                errors.push({ line: startLine + i, message: `Missing @end for @passage block` });
            } else {
                i++; // consume @end
            }
            passage = buf.join("\n").replace(/\s+$/, "");
            continue;
        }

        // Rich question body: @question ... @end (verbatim markdown)
        if (/^@question\s*$/i.test(trimmed)) {
            i++;
            const buf: string[] = [];
            while (i < lines.length && lines[i].trim().toLowerCase() !== "@end") {
                buf.push(lines[i]);
                i++;
            }
            if (i >= lines.length) {
                errors.push({ line: startLine + i, message: `Missing @end for @question block` });
            } else {
                i++; // consume @end
            }
            if (textLines.length > 0) textLines.push("");
            textLines.push(buf.join("\n").replace(/\s+$/, ""));
            continue;
        }

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

        // MCQ option (supports multi-line via `* [x] |||` ... `|||`)
        const optMatch = trimmed.match(/^\*\s*\[(x| )\]\s*(.*)$/i);
        if (optMatch) {
            const isCorrect = optMatch[1].toLowerCase() === "x";
            const rest = optMatch[2].trim();
            if (rest === "|||") {
                i++;
                const buf: string[] = [];
                while (i < lines.length && lines[i].trim() !== "|||") {
                    buf.push(lines[i]);
                    i++;
                }
                if (i >= lines.length) {
                    errors.push({ line: startLine + i, message: `Missing closing ||| for multi-line option` });
                } else {
                    i++; // consume closing |||
                }
                options.push({ isCorrect, text: buf.join("\n").trim() });
            } else {
                options.push({ isCorrect, text: rest });
                i++;
            }
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

        // Rich explanation: @explanation ... @end
        if (/^@explanation\s*$/i.test(trimmed)) {
            i++;
            const buf: string[] = [];
            while (i < lines.length && lines[i].trim().toLowerCase() !== "@end") {
                buf.push(lines[i]);
                i++;
            }
            if (i >= lines.length) {
                errors.push({ line: startLine + i, message: `Missing @end for @explanation block` });
            } else {
                i++;
            }
            explanation = buf.join("\n").trim();
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
    const marks = meta.marks ? Number(meta.marks) : 1;
    if (!Number.isFinite(marks) || marks <= 0) {
        errors.push({
            line: startLine,
            message: `Question ${questionNumber}: "marks" must be a positive number when provided`,
        });
        return null;
    }
    const difficulty = (meta.difficulty || "medium").toLowerCase() as DifficultyLevel;
    const negativeMarks = meta.negativemarks ? Number(meta.negativemarks) || 0 : 0;
    const sectionId = (meta.section || meta.sectionid || "").trim() || undefined;

    // Resolve passage / group: questions with the same `group` share a passage.
    // If this question defines @passage, it becomes the canonical passage for the group.
    // Otherwise we inherit it from any previous question in the same group.
    const passageGroup = (meta.group || meta.passagegroup || "").trim() || undefined;
    let resolvedPassage = passage.trim();
    if (passageGroup) {
        if (resolvedPassage) {
            groupPassages[passageGroup] = resolvedPassage;
        } else if (groupPassages[passageGroup]) {
            resolvedPassage = groupPassages[passageGroup];
        }
    }
    const finalPassage = resolvedPassage || undefined;

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
            sectionId,
            passageGroup,
            passage: finalPassage,
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
        sectionId,
        supportedLanguages: languages,
        starters: startersFinal,
        testCases,
        codeScoringMode: scoringMode,
        timeLimit: meta.timelimit ? Number(meta.timelimit) || 2 : 2,
        memoryLimit: meta.memorylimit ? Number(meta.memorylimit) || 128 : 128,
        passageGroup,
        passage: finalPassage,
    };
}

/**
 * Parse a markdown question bank into CreateQuestionInput[] (without seriesId/testId).
 */
export function parseQuestionsMarkdown(source: string): ParseResult {
    const text = clean(source);
    const sections = parseSectionBlocks(text);
    const blocks = splitQuestionBlocks(text);
    const errors: ParseError[] = [];
    const questions: CreateQuestionInput[] = [];

    if (blocks.length === 0) {
        errors.push({
            line: 1,
            message: 'No questions found. Each question must start with "## Question N".',
        });
        return { sections, questions, errors };
    }

    const groupPassages: Record<string, string> = {};
    blocks.forEach((block, idx) => {
        const q = parseQuestion(block, idx + 1, errors, groupPassages);
        if (q) questions.push(q);
    });

    return { sections, questions, errors };
}

/**
 * A documented sample template that admins can download as a starting point.
 */
export const QUESTION_TEMPLATE_MD = `# Question Bank Template

<!--
================================================================================
  HOW TO USE
================================================================================
  The OUTER file format is Markdown — but only at the *structural* level:
    - "## Question <N>" headings separate questions
    - "key: value" metadata lines (type, marks, difficulty, languages, …)
    - fenced blocks (@question, @explanation, @starter, @testcase) … @end

  The rendered CONTENT of these fields is **raw HTML** (the test UI uses an
  HTML renderer). Write the question prompt, MCQ option text, and the
  explanation using HTML tags such as:
      <p>…</p>            paragraphs
      <h3>…</h3>          subheadings
      <strong>…</strong>  bold
      <em>…</em>          italics
      <code>…</code>      inline code
      <pre><code class="language-python">…</code></pre>
                          multi-line code blocks
      <ul><li>…</li></ul> bullet list (or <ol> for numbered)
      <table>…</table>    tables
      <img src="…" alt="…" />
      <br />              line break

  Rules at a glance:
    - Each question starts with "## Question <N>".
    - Optional sections can be declared before questions:
        ## Section quant
        title: Quantitative Aptitude
        marksPerQuestion: 2
        negativeMarks: 0.5
        cutoffMarks: 10
      Then assign questions with:
        section: quant
    - Below the heading: metadata as "key: value" (case-insensitive keys).
        Required:  type
        Optional:  marks, negativeMarks, difficulty, languages, timeLimit,
                   memoryLimit, scoringMode, section
      If the assigned section defines marksPerQuestion / negativeMarks, those
      section values become the effective scoring scheme for that question.
    - Prompt — pick ONE form:
        (A) Short:  one or more "?" lines (HTML).
              ? <p>What is <code>2 + 2</code>?</p>
        (B) Rich :  @question ... @end (full HTML, captured verbatim).
    - MCQ options:
        * [x] <correct option HTML>
        * [ ] <wrong option HTML>
      Multi-line option:
        * [x] |||
        <p>HTML over multiple lines</p>
        |||
    - Code starters (RAW source code, not HTML):
        @starter <language>
        ...starter code verbatim...
        @end
    - Test cases (input/expected are RAW strings, not HTML):
        @testcase
        input: <single line>      OR   input: ||| ...multi-line... |||
        expected: <single line>   OR   expected: ||| ...multi-line... |||
        hidden: false
        weight: 1
        @end
    - Explanation (HTML):
        > Explanation: <p>One-liner</p>
      OR
        @explanation
        <p>Full HTML allowed.</p>
        @end
    - Reading comprehension / logical sets — group questions that share a
      common passage so they stay together when shuffle is enabled and the
      passage is displayed above each member:
        group: rc-passage-1        <-- same id on every question in the set
        @passage                   <-- only the first member needs the body
        <p>Shared HTML passage...</p>
        @end
      Subsequent questions just repeat "group: rc-passage-1" and inherit the
      passage automatically.
    - HTML comments like this one are ignored.
    - Save the file and upload via "Import Markdown" on the questions page.
================================================================================
-->

## Section fundamentals
title: Fundamentals
description: Basic aptitude and conceptual questions.
marksPerQuestion: 1
negativeMarks: 0.25
cutoffMarks: 2

## Section coding
title: Coding
description: Programming questions with weighted test cases.
marksPerQuestion: 10
negativeMarks: 0
cutoffMarks: 5


## Question 1
type: mcq
section: fundamentals
marks: 1
difficulty: easy

? <p>What is the value of <code>2 + 2</code> in JavaScript?</p>

* [x] <code>4</code>
* [ ] <code>"22"</code>
* [ ] <code>NaN</code>
* [ ] <code>undefined</code>

> Explanation: <p>Numeric addition yields <strong>4</strong>.</p>


## Question 2
type: mcq
section: fundamentals
marks: 3
negativeMarks: 1
difficulty: medium

@question
<h3>Database Indexing</h3>
<p>Given the following SQL query against a table with <strong>10 million rows</strong>:</p>
<pre><code class="language-sql">SELECT id, email
FROM users
WHERE lower(email) = 'alice@example.com';</code></pre>
<p>The table has a btree index on <code>email</code> (case-sensitive).</p>
<table>
  <thead>
    <tr><th>Column</th><th>Type</th><th>Indexed</th></tr>
  </thead>
  <tbody>
    <tr><td>id</td><td>bigint</td><td>PK</td></tr>
    <tr><td>email</td><td>varchar</td><td>btree</td></tr>
  </tbody>
</table>
<p><strong>Which statement is true?</strong></p>
@end

* [ ] |||
<p>The query uses the index on <code>email</code> because btree indexes
are case-insensitive by default.</p>
|||
* [x] |||
<p>The index will <strong>not</strong> be used because the
<code>lower(email)</code> expression is not indexed. A functional index
on <code>lower(email)</code> is required.</p>
|||
* [ ] <p>The query will fail with a syntax error.</p>
* [ ] <p>PostgreSQL will silently create a functional index on the fly.</p>

@explanation
<p>B-tree indexes match values <strong>exactly</strong> as stored. Wrapping
the column in a function (<code>lower(...)</code>) means the planner cannot
use the existing index; it must either do a sequential scan or use a
dedicated <em>expression index</em>:</p>
<pre><code class="language-sql">CREATE INDEX users_email_lower_idx ON users (lower(email));</code></pre>
@end


## Question 3
type: code
section: coding
marks: 10
difficulty: hard
languages: python, javascript, cpp
timeLimit: 2
memoryLimit: 256
scoringMode: weighted

@question
<h3>Two-Sum (Sorted Variant)</h3>
<p>You are given a <strong>sorted</strong> array of integers <code>nums</code>
and a target value <code>target</code>. Return the <strong>1-indexed</strong>
positions of the two numbers such that they add up to <code>target</code>.</p>

<h4>Constraints</h4>
<ul>
  <li><code>2 &le; nums.length &le; 10^5</code></li>
  <li><code>-10^9 &le; nums[i], target &le; 10^9</code></li>
  <li>Exactly one valid answer exists.</li>
  <li>You <strong>must</strong> solve it in <code>O(n)</code> time and
      <code>O(1)</code> extra space.</li>
</ul>

<h4>Input format</h4>
<pre><code>Line 1: n target
Line 2: n space-separated integers</code></pre>

<h4>Output format</h4>
<p>Two integers <code>i j</code> (1-indexed, <code>i &lt; j</code>) separated
by a space.</p>

<h4>Example</h4>
<pre><code>Input:
4 9
2 7 11 15

Output:
1 2</code></pre>
@end

@starter python
import sys

def two_sum(nums, target):
    # TODO: implement using two pointers
    return (-1, -1)

def main():
    data = sys.stdin.read().split()
    n, target = int(data[0]), int(data[1])
    nums = list(map(int, data[2:2 + n]))
    i, j = two_sum(nums, target)
    print(i, j)

if __name__ == "__main__":
    main()
@end

@starter javascript
function twoSum(nums, target) {
  // TODO: implement using two pointers
  return [-1, -1];
}

const data = require('fs').readFileSync(0, 'utf8').trim().split(/\\s+/).map(Number);
const n = data[0], target = data[1];
const nums = data.slice(2, 2 + n);
const [i, j] = twoSum(nums, target);
console.log(i + ' ' + j);
@end

@starter cpp
#include <bits/stdc++.h>
using namespace std;

pair<int,int> twoSum(const vector<int>& nums, long long target) {
    // TODO: implement using two pointers
    return {-1, -1};
}

int main() {
    int n; long long target;
    cin >> n >> target;
    vector<int> nums(n);
    for (auto& x : nums) cin >> x;
    auto [i, j] = twoSum(nums, target);
    cout << i << " " << j << "\\n";
}
@end

@testcase
input: |||
4 9
2 7 11 15
|||
expected: 1 2
hidden: false
weight: 1
@end

@testcase
input: |||
2 6
3 3
|||
expected: 1 2
hidden: false
weight: 1
@end

@testcase
input: |||
5 -1
-3 -2 -1 1 4
|||
expected: 2 4
hidden: true
weight: 2
@end

@testcase
input: |||
6 1000000000
1 2 3 999999998 999999999 1000000000
|||
expected: 3 5
hidden: true
weight: 3
@end

@explanation
<p>Use the <strong>two-pointer</strong> technique on the sorted array:</p>
<pre><code>left  = 0
right = n - 1
while left &lt; right:
    s = nums[left] + nums[right]
    if s == target: return (left+1, right+1)
    if s &lt;  target: left  += 1
    else:           right -= 1</code></pre>
<p>Runs in <code>O(n)</code> time with <code>O(1)</code> extra memory.</p>
@end


## Question 4
type: mcq
section: fundamentals
marks: 1
difficulty: medium
group: rc-photosynthesis

@passage
<h3>Reading Passage</h3>
<p>Photosynthesis is the process used by plants, algae and certain
bacteria to harness energy from sunlight and turn it into chemical
energy. During photosynthesis in green plants, light energy is captured
and used to convert water, carbon dioxide, and minerals into oxygen and
energy-rich organic compounds.</p>
<p>The overall reaction can be summarized as:</p>
<pre><code>6 CO&#8322; + 6 H&#8322;O + light &rarr; C&#8326;H&#8321;&#8322;O&#8326; + 6 O&#8322;</code></pre>
@end

? <p>According to the passage, which of the following is <strong>NOT</strong>
a direct input to photosynthesis?</p>

* [ ] Sunlight
* [ ] Water
* [ ] Carbon dioxide
* [x] <code>C&#8326;H&#8321;&#8322;O&#8326;</code> (glucose)

> Explanation: <p>Glucose is a <em>product</em>, not an input.</p>


## Question 5
type: mcq
section: fundamentals
marks: 1
difficulty: medium
group: rc-photosynthesis

? <p>Based on the passage, photosynthesis is best described as a process
that converts:</p>

* [ ] Chemical energy into light energy.
* [x] Light energy into chemical energy.
* [ ] Heat energy into electrical energy.
* [ ] Mechanical energy into chemical energy.


## Question 6
type: mcq
section: fundamentals
marks: 1
difficulty: hard
group: rc-photosynthesis

? <p>Which organisms does the passage explicitly mention as performing
photosynthesis?</p>

* [ ] Only flowering plants.
* [ ] Plants and fungi.
* [x] Plants, algae and certain bacteria.
* [ ] All multicellular organisms.

@explanation
<p>The very first sentence of the passage lists <em>plants, algae and
certain bacteria</em> as photosynthesisers.</p>
@end
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
