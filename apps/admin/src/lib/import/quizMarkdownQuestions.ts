import type { CreateQuizQuestionInput, DifficultyLevel, MCQOption, QuestionType } from "@digimine/types";

export type QuizParseError = { line: number; message: string };

export interface QuizParseResult {
    questions: CreateQuizQuestionInput[];
    errors: QuizParseError[];
}

type QuizQuestionType = Exclude<QuestionType, "code">;

function clean(source: string) {
    return source
        .replace(/^\uFEFF/, "")
        .replace(/\r\n?/g, "\n")
        .replace(/<!--[\s\S]*?-->/g, "");
}

function parseMeta(line: string): { key: string; value: string } | null {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!match) return null;
    return { key: match[1].toLowerCase(), value: match[2].trim() };
}

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

function readFence(lines: string[], startIndex: number, endMarker = "@end") {
    const buffer: string[] = [];
    let i = startIndex;

    while (i < lines.length && lines[i].trim().toLowerCase() !== endMarker.toLowerCase()) {
        buffer.push(lines[i]);
        i++;
    }

    return {
        value: buffer.join("\n").replace(/\s+$/, ""),
        nextIndex: i < lines.length ? i + 1 : i,
        closed: i < lines.length,
    };
}

function readDelimitedValue(lines: string[], startIndex: number) {
    const buffer: string[] = [];
    let i = startIndex;

    while (i < lines.length && lines[i].trim() !== "|||") {
        buffer.push(lines[i]);
        i++;
    }

    return {
        value: buffer.join("\n").trim(),
        nextIndex: i < lines.length ? i + 1 : i,
        closed: i < lines.length,
    };
}

function parseNumber(value: string | undefined, fallback: number) {
    if (!value) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDifficulty(value: string | undefined): DifficultyLevel {
    const difficulty = (value || "medium").toLowerCase();
    if (difficulty === "easy" || difficulty === "hard") return difficulty;
    return "medium";
}

function readAnswerFromMeta(
    meta: { key: string; value: string },
    lines: string[],
    currentIndex: number,
    errors: QuizParseError[],
    lineNumber: number
) {
    if (meta.value !== "|||") {
        return { value: meta.value, nextIndex: currentIndex + 1 };
    }

    const result = readDelimitedValue(lines, currentIndex + 1);
    if (!result.closed) {
        errors.push({ line: lineNumber, message: "Missing closing ||| for multi-line answer" });
    }
    return { value: result.value, nextIndex: result.nextIndex };
}

function parseQuestion(
    block: { lines: string[]; startLine: number },
    questionNumber: number,
    errors: QuizParseError[],
    groupPassages: Record<string, string>
): CreateQuizQuestionInput | null {
    const { lines, startLine } = block;
    const meta: Record<string, string> = {};
    const textLines: string[] = [];
    const options: { text: string; isCorrect: boolean }[] = [];
    let explanation = "";
    let passage = "";
    let correctAnswer = "";

    let i = 0;

    while (i < lines.length) {
        const raw = lines[i];
        const trimmed = raw.trim();

        if (trimmed === "") {
            i++;
            break;
        }

        if (
            trimmed.startsWith("?") ||
            trimmed.startsWith("*") ||
            trimmed.startsWith("@") ||
            trimmed.startsWith(">") ||
            trimmed.startsWith("#")
        ) {
            break;
        }

        const parsed = parseMeta(trimmed);
        if (parsed) meta[parsed.key] = parsed.value;
        i++;
    }

    correctAnswer = meta.correctanswer || meta.answer || meta.answers || "";

    while (i < lines.length) {
        const raw = lines[i];
        const trimmed = raw.trim();

        if (/^@passage\s*$/i.test(trimmed)) {
            const result = readFence(lines, i + 1);
            if (!result.closed) {
                errors.push({ line: startLine + i, message: "Missing @end for @passage block" });
            }
            passage = result.value;
            i = result.nextIndex;
            continue;
        }

        if (/^@question\s*$/i.test(trimmed)) {
            const result = readFence(lines, i + 1);
            if (!result.closed) {
                errors.push({ line: startLine + i, message: "Missing @end for @question block" });
            }
            if (textLines.length > 0) textLines.push("");
            textLines.push(result.value);
            i = result.nextIndex;
            continue;
        }

        if (trimmed.startsWith("?")) {
            textLines.push(trimmed.replace(/^\?\s*/, ""));
            i++;
            while (i < lines.length) {
                const next = lines[i].trim();
                if (next === "") {
                    i++;
                    break;
                }
                if (
                    next.startsWith("*") ||
                    next.startsWith("@") ||
                    next.startsWith(">") ||
                    /^[A-Za-z][A-Za-z0-9_-]*:/.test(next)
                ) {
                    break;
                }
                textLines.push(next);
                i++;
            }
            continue;
        }

        const optionMatch = trimmed.match(/^\*\s*\[(x| )\]\s*(.*)$/i);
        if (optionMatch) {
            const isCorrect = optionMatch[1].toLowerCase() === "x";
            const optionText = optionMatch[2].trim();

            if (optionText === "|||") {
                const result = readDelimitedValue(lines, i + 1);
                if (!result.closed) {
                    errors.push({ line: startLine + i, message: "Missing closing ||| for multi-line option" });
                }
                options.push({ isCorrect, text: result.value });
                i = result.nextIndex;
            } else {
                options.push({ isCorrect, text: optionText });
                i++;
            }
            continue;
        }

        if (/^@answer\s*$/i.test(trimmed)) {
            const result = readFence(lines, i + 1);
            if (!result.closed) {
                errors.push({ line: startLine + i, message: "Missing @end for @answer block" });
            }
            correctAnswer = result.value.trim();
            i = result.nextIndex;
            continue;
        }

        if (/^@explanation\s*$/i.test(trimmed)) {
            const result = readFence(lines, i + 1);
            if (!result.closed) {
                errors.push({ line: startLine + i, message: "Missing @end for @explanation block" });
            }
            explanation = result.value.trim();
            i = result.nextIndex;
            continue;
        }

        if (/^>\s*explanation\b/i.test(trimmed)) {
            const after = trimmed.replace(/^>\s*explanation\s*:?\s*/i, "");
            const buffer: string[] = [];
            if (after) buffer.push(after);
            i++;

            while (i < lines.length) {
                const next = lines[i].trim();
                if (next === "") {
                    i++;
                    break;
                }
                if (next.startsWith(">")) {
                    buffer.push(next.replace(/^>\s*/, ""));
                } else {
                    buffer.push(next);
                }
                i++;
            }

            explanation = buffer.join("\n").trim();
            continue;
        }

        if (/^>\s*(answer|correctanswer|correct-answer)\b/i.test(trimmed)) {
            correctAnswer = trimmed.replace(/^>\s*(answer|correctanswer|correct-answer)\s*:?\s*/i, "").trim();
            i++;
            continue;
        }

        const bodyMeta = parseMeta(trimmed);
        if (bodyMeta && ["answer", "answers", "correctanswer", "correct-answer"].includes(bodyMeta.key)) {
            const result = readAnswerFromMeta(bodyMeta, lines, i, errors, startLine + i);
            correctAnswer = result.value.trim();
            i = result.nextIndex;
            continue;
        }

        i++;
    }

    const type = (meta.type || "").toLowerCase() as QuizQuestionType;
    if (type !== "mcq" && type !== "text_input") {
        errors.push({
            line: startLine,
            message: `Question ${questionNumber}: missing or invalid "type" (must be mcq or text_input)`,
        });
        return null;
    }

    const questionText = textLines.join("\n").trim();
    if (!questionText) {
        errors.push({
            line: startLine,
            message: `Question ${questionNumber}: missing question text (use ? text or @question ... @end)`,
        });
        return null;
    }

    const marks = parseNumber(meta.marks, 1);
    if (marks <= 0) {
        errors.push({
            line: startLine,
            message: `Question ${questionNumber}: "marks" must be a positive number`,
        });
        return null;
    }

    const negativeMarks = parseNumber(meta.negativemarks ?? meta.negative, 0);
    const passageGroup = (meta.group || meta.passagegroup || "").trim() || undefined;
    let resolvedPassage = passage.trim();

    if (passageGroup) {
        if (resolvedPassage) {
            groupPassages[passageGroup] = resolvedPassage;
        } else if (groupPassages[passageGroup]) {
            resolvedPassage = groupPassages[passageGroup];
        }
    }

    const base = {
        quizId: "",
        questionText,
        explanation: explanation || undefined,
        marks,
        negativeMarks,
        difficulty: parseDifficulty(meta.difficulty),
        passageGroup,
        passage: resolvedPassage || undefined,
    };

    if (type === "mcq") {
        if (options.length < 2) {
            errors.push({
                line: startLine,
                message: `Question ${questionNumber}: MCQ requires at least 2 options`,
            });
            return null;
        }

        if (!options.some((option) => option.isCorrect)) {
            errors.push({
                line: startLine,
                message: `Question ${questionNumber}: MCQ must have one correct option marked with [x]`,
            });
            return null;
        }

        return {
            ...base,
            type: "mcq",
            options: options as Omit<MCQOption, "id">[],
        };
    }

    if (!correctAnswer.trim()) {
        errors.push({
            line: startLine,
            message: `Question ${questionNumber}: text_input requires correctAnswer or @answer`,
        });
        return null;
    }

    return {
        ...base,
        type: "text_input",
        correctAnswer: correctAnswer.trim(),
    };
}

export function parseQuizQuestionsMarkdown(source: string): QuizParseResult {
    const text = clean(source);
    const blocks = splitQuestionBlocks(text);
    const errors: QuizParseError[] = [];
    const questions: CreateQuizQuestionInput[] = [];

    if (blocks.length === 0) {
        errors.push({
            line: 1,
            message: 'No questions found. Each question must start with "## Question N".',
        });
        return { questions, errors };
    }

    const groupPassages: Record<string, string> = {};
    blocks.forEach((block, index) => {
        const question = parseQuestion(block, index + 1, errors, groupPassages);
        if (question) questions.push(question);
    });

    return { questions, errors };
}

export const QUIZ_QUESTION_TEMPLATE_MD = `# Quiz Question Import Template

<!--
================================================================================
  HOW TO USE
================================================================================
  This file imports questions into one quiz.

  The outer format is Markdown only for structure:
    - "## Question <N>" separates questions.
    - "key: value" metadata lines configure each question.
    - @question, @passage, @answer, and @explanation blocks capture rich HTML.

  The rendered content is raw HTML because Digimine renders it with the same
  rich content renderer used in the question editor. You can use:
      <p>, <h3>, <strong>, <em>, <code>, <pre><code>, <ul>, <ol>, <table>,
      <img src="..." alt="..." />, and embedded video HTML created by the editor.

  Supported question types:
    - mcq
    - text_input

  Common metadata:
    type: mcq | text_input
    marks: 1
    negativeMarks: 0
    difficulty: easy | medium | hard
    group: shared-passage-id       optional, keeps passage-based questions linked

  Prompt:
    ? <p>Short HTML prompt</p>

  Or:
    @question
    <p>Rich HTML prompt with images, tables, code, and video embeds.</p>
    @end

  MCQ options:
    * [x] <p>Correct option</p>
    * [ ] <p>Wrong option</p>

  Multi-line MCQ option:
    * [x] |||
    <p>Long option with <strong>HTML</strong>.</p>
    |||

  Text input answer:
    correctAnswer: TCP

  Or:
    @answer
    Transmission Control Protocol
    @end

  Explanation:
    > Explanation: <p>Short explanation.</p>

  Or:
    @explanation
    <p>Full explanation with rich HTML.</p>
    @end

  Shared passage:
    group: cn-osi
    @passage
    <p>Only the first question in the group needs this passage.</p>
    @end
    Later questions repeat "group: cn-osi" and inherit the passage.
================================================================================
-->

## Question 1
type: mcq
marks: 1
negativeMarks: 0
difficulty: easy

? <p>Which layer of the OSI model is responsible for routing packets between networks?</p>

* [ ] <p>Application layer</p>
* [ ] <p>Transport layer</p>
* [x] <p>Network layer</p>
* [ ] <p>Data link layer</p>

> Explanation: <p>The network layer handles logical addressing and routing.</p>


## Question 2
type: text_input
marks: 2
negativeMarks: 0
difficulty: medium

@question
<p>Expand the abbreviation <strong>TCP</strong>.</p>
@end

correctAnswer: Transmission Control Protocol

@explanation
<p>TCP stands for <strong>Transmission Control Protocol</strong>, a reliable transport-layer protocol.</p>
@end


## Question 3
type: mcq
marks: 2
negativeMarks: 0.5
difficulty: medium
group: cn-switching

@passage
<h3>Switching Scenario</h3>
<p>A switch learns source MAC addresses from incoming frames and stores them in a MAC address table.</p>
<p><img src="https://example.com/network-switch.png" alt="Network switch diagram" /></p>
@end

@question
<p>If a switch receives a frame whose destination MAC address is unknown, what does it do?</p>
@end

* [ ] <p>Drops the frame immediately.</p>
* [x] <p>Floods the frame out of all ports except the incoming port.</p>
* [ ] <p>Sends the frame only to the router.</p>
* [ ] <p>Converts the frame into an IP packet.</p>

> Explanation: <p>Unknown unicast frames are flooded until the switch learns the destination location.</p>


## Question 4
type: mcq
marks: 1
negativeMarks: 0.25
difficulty: hard
group: cn-switching

? <p>In the same scenario, which address does the switch learn from a received frame?</p>

* [x] <p>Source MAC address</p>
* [ ] <p>Destination MAC address only</p>
* [ ] <p>Source IP address</p>
* [ ] <p>Default gateway address</p>
`;

export function downloadQuizQuestionTemplate(filename = "quiz-question-template.md") {
    const blob = new Blob([QUIZ_QUESTION_TEMPLATE_MD], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}
