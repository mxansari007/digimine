import { writeFileSync } from "fs";
import { arrayDiagram, linkedListDiagram, stackDiagram, gridDiagram, complexityChart, dotSvg, DOT_COLORS } from "./diagrams";

const blocks: { title: string; html: string }[] = [
    { title: "Complexity growth chart", html: complexityChart() },
    {
        title: "Array — indices + two pointers + window",
        html: arrayDiagram([3, 1, 4, 1, 5, 9, 2, 6], {
            indices: true, range: [2, 5], highlight: [2, 5],
            pointers: [{ i: 2, label: "lo" }, { i: 5, label: "hi", color: "amber" }],
            caption: "Two-pointer window over a sorted array (lo and hi converge).",
        }),
    },
    { title: "Singly linked list", html: linkedListDiagram([5, 3, 8, 1], { head: true, caption: "Singly linked list: head → nodes → ∅. Each node is value | next." }) },
    { title: "Doubly linked list", html: linkedListDiagram([10, 20, 30], { head: true, doubly: true, caption: "Doubly linked list — dashed back-edges are prev pointers." }) },
    { title: "Circular linked list", html: linkedListDiagram([1, 2, 3, 4], { head: true, circular: true, caption: "Circular: the tail's next points back to the head." }) },
    { title: "Stack (LIFO)", html: stackDiagram([7, 2, 9, 4], { caption: "Stack grows upward; push/pop happen at the top." }) },
    { title: "DP grid (edit distance)", html: gridDiagram([[0, 1, 2, 3], [1, 1, 2, 3], [2, 2, 1, 2], [3, 3, 2, 2]], { colHeaders: ["", "h", "o", "s"], rowHeaders: ["", "c", "a", "t"], highlight: [[3, 3]], caption: "2-D DP table; the answer sits in the bottom-right cell." }) },
    { title: "Binary Search Tree (graphviz)", html: dotSvg(`8->3; 8->10; 3->1; 3->6; 10->14; 6->4; 6->7;`, { caption: "A BST: every left child < parent < every right child." }) },
    { title: "Directed graph with weights (graphviz)", html: dotSvg(`rankdir=LR; A->B[label=4]; A->C[label=1]; C->B[label=2]; B->D[label=5]; C->D[label=8]; D[${DOT_COLORS.teal}];`, { caption: "Weighted directed graph (Dijkstra-style)." }) },
];

const html = `<!doctype html><html><head><meta charset="utf-8"><title>DSA diagram preview</title>
<style>body{font-family:system-ui;max-width:760px;margin:2rem auto;padding:0 1rem;color:#0f172a}
.card{border:1px solid #e2e8f0;border-radius:16px;padding:1.5rem;margin:1.25rem 0;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.04)}
h3{font-size:.8rem;text-transform:uppercase;letter-spacing:.1em;color:#64748b;margin:0 0 .5rem}
.dark{background:#0b1220;padding:1rem;border-radius:16px;margin-top:2rem}.dark .card{background:#111827;border-color:#1f2937;color:#e2e8f0}</style>
</head><body>
<h1>DSA diagram toolkit — preview</h1>
<p style="color:#64748b">Each block is exactly what gets embedded into a subtopic's content. Scroll to the bottom for a dark-surface check.</p>
${blocks.map((b) => `<div class="card"><h3>${b.title}</h3>${b.html}</div>`).join("")}
<div class="dark"><p style="color:#94a3b8;font-size:.85rem">Dark-surface check (diagrams use mid-tones + transparent fills):</p>
${blocks.slice(0, 6).map((b) => `<div class="card">${b.html}</div>`).join("")}
</div>
</body></html>`;

writeFileSync("/tmp/dsa-diagrams-preview.html", html);
console.log("wrote /tmp/dsa-diagrams-preview.html");
// quick well-formedness sanity: count <svg> and </svg>
const open = (html.match(/<svg/g) || []).length, close = (html.match(/<\/svg>/g) || []).length;
console.log(`svg open=${open} close=${close} ${open === close ? "OK" : "MISMATCH"}`);
