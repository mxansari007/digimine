/**
 * DSA — Chapter 1: Foundations & Complexity Analysis (improved text + diagrams)
 *   FIRESTORE_EMULATOR_HOST= ... pnpm tsx scripts/dsa/ch1.ts
 */
import { config } from "dotenv";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { complexityChart, gridDiagram, stackDiagram, dotSvg, fig, esc, PALETTE as P } from "./diagrams";
config({ path: "/Users/maazansari/digimine/apps/web/.env.local" });
const pid = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
if (!getApps().length) initializeApp({ credential: cert({ projectId: pid, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!, privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n") }) });
const db = getFirestore();

// "cost per insertion" bar chart for amortised doubling
function amortisedBars(): string {
    const W = 480, H = 180, ml = 36, mb = 30, mt = 14, mr = 10;
    const pw = W - ml - mr, ph = H - mt - mb, x0 = ml, y0 = mt + ph;
    const n = 16;
    const cost = (i: number) => (Math.log2(i) % 1 === 0 ? i : 1); // resize at powers of 2 copies i elements
    const bw = pw / n * 0.7, gap = pw / n;
    let body = `<line x1="${x0}" y1="${y0}" x2="${x0 + pw}" y2="${y0}" stroke="${P.line}" stroke-width="1.3"/>`;
    body += `<line x1="${x0}" y1="${mt}" x2="${x0}" y2="${y0}" stroke="${P.line}" stroke-width="1.3"/>`;
    const maxc = 16;
    for (let i = 1; i <= n; i++) {
        const c = cost(i), spike = c > 1;
        const x = x0 + (i - 1) * gap + (gap - bw) / 2;
        const bh = (c / maxc) * ph;
        body += `<rect x="${x}" y="${y0 - bh}" width="${bw}" height="${bh}" rx="1.5" fill="${spike ? P.amber : P.teal}"/>`;
        if (i === 1 || i % 4 === 0) body += `<text x="${x + bw / 2}" y="${y0 + 14}" text-anchor="middle" font-size="9.5" fill="${P.muted}">${i}</text>`;
    }
    body += `<text x="${x0 + pw / 2}" y="${H - 4}" text-anchor="middle" font-size="11" fill="${P.muted}">insertion number →</text>`;
    body += `<text x="${x0 + pw - 4}" y="${mt + 12}" text-anchor="end" font-size="10.5" font-weight="700" fill="${P.amber}">↑ resize copies all elements</text>`;
    return fig(`<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;height:auto" xmlns="http://www.w3.org/2000/svg">${body}</svg>`,
        "Cost of each insertion into a dynamic array. Most cost 1 (teal); the rare resizes (amber) copy everything — yet the total stays O(n), so the <em>average</em> per insert is O(1).", 500);
}

const SUBTOPICS: Array<{ title: string; html: string }> = [
  {
    title: "Why DSA? Solving problems efficiently",
    html: `<p>Two programs can solve the <em>same</em> problem yet differ by a factor of a million in speed. The difference is almost never the programming language — it is the <strong>data structure</strong> chosen to hold the data and the <strong>algorithm</strong> used to process it. That choice is what Data Structures &amp; Algorithms (DSA) trains you to make.</p>
<ul>
<li>A <strong>data structure</strong> organises data in memory so specific operations are fast (e.g. an array gives O(1) index access; a hash map gives O(1) lookup by key).</li>
<li>An <strong>algorithm</strong> is a finite, unambiguous sequence of steps that transforms an input into the desired output.</li>
</ul>
<h2>The phone-book intuition</h2>
<p>Search for one name among <strong>1,000,000,000</strong> sorted entries:</p>
<table>
<thead><tr><th>Strategy</th><th>Comparisons (worst case)</th><th>At 1M checks/sec</th></tr></thead>
<tbody>
<tr><td>Linear scan — check every entry</td><td>1,000,000,000</td><td>~16 minutes</td></tr>
<tr><td>Binary search — halve each step</td><td>~30</td><td>0.00003 seconds</td></tr>
</tbody>
</table>
<p>Same input, same machine — one is unusable, the other is instant. As <em>n</em> grows, this gap explodes. The chart below shows why the <strong>order of growth</strong> matters far more than constant factors.</p>
${complexityChart("As input size n grows, the algorithm's growth rate dominates everything. An O(2ⁿ) solution that is fine for n = 20 is hopeless at n = 60.")}
<h2>Where DSA runs the world</h2>
<ul>
<li><strong>Google Search</strong> — inverted indexes + ranking over billions of pages</li>
<li><strong>GPS / Maps</strong> — Dijkstra &amp; A* shortest-path algorithms</li>
<li><strong>Databases</strong> — B-trees index millions of rows for O(log n) lookups</li>
<li><strong>Compilers</strong> — stacks for expression and call-frame management</li>
</ul>
<h2>The mindset to build</h2>
<p>Every problem has a <strong>brute-force</strong> solution (try everything) and usually a smarter one. The DSA habit is to ask three questions before writing code:</p>
<ol>
<li>What access pattern do I need (lookup by key? by position? min/max?) → picks the data structure.</li>
<li>Where is the redundant work, and can I avoid recomputing it? → picks the algorithm.</li>
<li>How fast and how memory-hungry is my idea, in the worst case? → the complexity analysis in this chapter.</li>
</ol>
<blockquote><strong>Interview reality:</strong> companies don't test whether you can code a loop — they test whether you can spot that a naive O(n²) loop will time out and replace it with an O(n) or O(n log n) approach.</blockquote>`,
  },
  {
    title: "Time complexity — Big-O, Big-Ω, Big-Θ notation",
    html: `<p>Time complexity describes how an algorithm's <strong>number of basic operations</strong> grows as the input size <em>n</em> grows. It deliberately ignores the language, the CPU and constant factors, so it stays true on any machine.</p>
<h2>The three asymptotic notations</h2>
<table>
<thead><tr><th>Notation</th><th>Bound</th><th>Plain meaning</th></tr></thead>
<tbody>
<tr><td><strong>O(f(n))</strong></td><td>Upper</td><td>grows <em>no faster than</em> f(n) — the worst case</td></tr>
<tr><td><strong>Ω(f(n))</strong></td><td>Lower</td><td>grows <em>at least as fast as</em> f(n) — the best case</td></tr>
<tr><td><strong>Θ(f(n))</strong></td><td>Tight</td><td>grows <em>exactly</em> on the order of f(n)</td></tr>
</tbody>
</table>
<p>In interviews "complexity" almost always means <strong>Big-O of the worst case</strong> unless stated otherwise.</p>
<h2>The complexity ladder (fastest → slowest)</h2>
<table>
<thead><tr><th>Order</th><th>Name</th><th>Doubling n does what?</th><th>Example</th></tr></thead>
<tbody>
<tr><td>O(1)</td><td>Constant</td><td>nothing</td><td>array index, hash lookup</td></tr>
<tr><td>O(log n)</td><td>Logarithmic</td><td>+1 step</td><td>binary search</td></tr>
<tr><td>O(n)</td><td>Linear</td><td>doubles</td><td>scan an array</td></tr>
<tr><td>O(n log n)</td><td>Linearithmic</td><td>a bit more than doubles</td><td>merge sort</td></tr>
<tr><td>O(n²)</td><td>Quadratic</td><td>×4</td><td>nested loops</td></tr>
<tr><td>O(2ⁿ)</td><td>Exponential</td><td>squares</td><td>all subsets</td></tr>
</tbody>
</table>
<h2>Reading Big-O straight off the code</h2>
<p>Count how many times the work inside the deepest loop runs.</p>
<pre><code>// O(n) — one pass
for (int i = 0; i &lt; n; i++) sum += a[i];

// O(n²) — every i pairs with every j
for (int i = 0; i &lt; n; i++)
  for (int j = 0; j &lt; n; j++) check(a[i], a[j]);

// O(log n) — the range halves each turn
while (lo &lt;= hi) { mid = (lo+hi)/2; ... }</code></pre>
<p>A nested loop over the same array does <em>n × n</em> units of work — literally every cell of an n×n grid of (i, j) pairs:</p>
${gridDiagram(
    Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => "•")),
    { colHeaders: [0, 1, 2, 3, 4], rowHeaders: [0, 1, 2, 3, 4], caption: "Two nested loops over n = 5 touch all 25 (i, j) pairs → n² = 25 operations. That is why nested loops are O(n²)." }
)}
<h2>The two simplification rules</h2>
<ol>
<li><strong>Drop constants:</strong> O(3n + 100) → <strong>O(n)</strong>. Constants don't change the growth rate.</li>
<li><strong>Keep only the dominant term:</strong> O(n² + n) → <strong>O(n²)</strong>. At large n the biggest term swamps the rest.</li>
</ol>
<blockquote><strong>Common mistake:</strong> two <em>sequential</em> loops are O(n) + O(n) = O(2n) = <strong>O(n)</strong>, not O(n²). Only <em>nested</em> loops multiply.</blockquote>`,
  },
  {
    title: "Space complexity — auxiliary vs total space",
    html: `<p>Space complexity measures the extra memory an algorithm consumes as a function of input size <em>n</em>. Split it into two parts:</p>
<ul>
<li><strong>Input space</strong> — memory the input itself occupies (you can't avoid it).</li>
<li><strong>Auxiliary space</strong> — extra memory <em>your algorithm</em> allocates. This is what interviewers mean by "space complexity".</li>
</ul>
<h2>Quick reference</h2>
<table>
<thead><tr><th>Algorithm</th><th>Auxiliary space</th><th>Why</th></tr></thead>
<tbody>
<tr><td>In-place reversal / bubble sort</td><td>O(1)</td><td>just a few variables</td></tr>
<tr><td>Merge sort</td><td>O(n)</td><td>a temporary merge buffer</td></tr>
<tr><td>Recursive tree DFS (height h)</td><td>O(h)</td><td>one stack frame per level</td></tr>
<tr><td>BFS</td><td>O(width)</td><td>the queue holds a whole level</td></tr>
<tr><td>Memoised DP (n states)</td><td>O(n)</td><td>the cache</td></tr>
</tbody>
</table>
<h2>The hidden cost: the recursion call stack</h2>
<p>Even a function that allocates nothing uses memory when it recurses — each pending call keeps a <strong>stack frame</strong> (its locals, parameters and return address) alive until it returns. A recursion of depth <em>d</em> therefore needs <strong>O(d)</strong> stack space.</p>
${stackDiagram(["factorial(0)", "factorial(1)", "factorial(2)", "factorial(3)"], { topLabel: "executing now", caption: "factorial(3) builds 4 stacked frames before any returns. Depth d = 4 → O(d) stack space. Recurse too deep and you get a StackOverflowError." })}
<pre><code>int factorial(int n) {
    if (n == 0) return 1;       // base case ends the recursion
    return n * factorial(n-1);  // frame stays alive until this returns
}
// Depth = n  →  O(n) auxiliary space (the call stack)</code></pre>
<h2>The space–time trade-off</h2>
<p>Faster usually means hungrier. A hash map buys O(1) average lookup by spending O(n) memory. Sorting in place saves memory but may run slower or lose stability. There is rarely a free lunch.</p>
<blockquote><strong>Interview tip:</strong> when asked to "optimise", clarify whether they want less <em>time</em> or less <em>space</em> — the two often pull in opposite directions.</blockquote>`,
  },
  {
    title: "Best, average, worst case analysis",
    html: `<p>The same algorithm can be lightning-fast on one input and crawl on another. Case analysis pins down this variability.</p>
<table>
<thead><tr><th>Case</th><th>Meaning</th><th>Linear search for x</th></tr></thead>
<tbody>
<tr><td><strong>Best</strong></td><td>luckiest input</td><td>x is first → O(1)</td></tr>
<tr><td><strong>Average</strong></td><td>expected over all inputs</td><td>x is mid on average → O(n)</td></tr>
<tr><td><strong>Worst</strong></td><td>most hostile input</td><td>x is last or absent → O(n)</td></tr>
</tbody>
</table>
<h2>Why we design for the worst case</h2>
<p>Real systems must <em>guarantee</em> response times. A server that is usually fast but occasionally freezes for 10 seconds is unacceptable, so we engineer and quote the <strong>worst case</strong>.</p>
<h2>Quick Sort — the textbook case study</h2>
<p>Quick Sort partitions around a <em>pivot</em>. Its speed depends entirely on how balanced those partitions are.</p>
<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">
${dotSvg(`P[label="pivot"]; P->L[label=" ≤"]; P->R[label=" >"]; L->LL; L->LR; R->RL; R->RR;`, { caption: "Best / average: pivot splits in half → log n levels → O(n log n).", maxW: 220 })}
${dotSvg(`rankdir=TB; a[label="pivot"]; a->b[label=" >"]; b[label="pivot"]; b->c[label=" >"]; c[label="pivot"]; c->d[label=" >"]; d[label="..."];`, { caption: "Worst: pivot is always the max → n levels → O(n²). Happens on sorted input with a naive pivot.", maxW: 150 })}
</div>
<p>This is exactly why production Quick Sort uses a <strong>randomised</strong> or <strong>median-of-three</strong> pivot — it makes the O(n²) worst case astronomically unlikely.</p>
<h2>Average case needs a probability model</h2>
<p>Average-case analysis assumes a distribution over inputs (usually uniform). Hash-table lookup is O(1) <em>on average</em> assuming a good hash function, but O(n) in the worst case when every key collides into one bucket.</p>
<blockquote><strong>State the case.</strong> "O(n log n)" alone is ambiguous — say "O(n log n) average, O(n²) worst" for Quick Sort. Examiners look for this precision.</blockquote>`,
  },
  {
    title: "Amortised analysis — dynamic array example",
    html: `<p>Amortised analysis finds the <strong>average cost per operation across a whole sequence</strong>, even when a few individual operations are expensive. Crucially, it makes <em>no probabilistic assumption</em> — it is a worst-case average, not a typical-case one.</p>
<h2>The dynamic array (ArrayList / vector / Python list)</h2>
<p>A dynamic array starts small and <strong>doubles its capacity</strong> when full. Appending n elements:</p>
<ul>
<li>Almost every append just writes to the next free slot → O(1).</li>
<li>Occasionally the array is full, so it allocates a bigger block and <strong>copies everything</strong> → O(current size).</li>
</ul>
${amortisedBars()}
<h2>Why the total is still O(n)</h2>
<p>The copy costs are 1 + 2 + 4 + 8 + … + n. This geometric series sums to <strong>less than 2n</strong>. Add the n cheap writes and the whole sequence of n appends costs ≈ 3n = <strong>O(n)</strong> total — so the <strong>amortised cost per append is O(1)</strong>.</p>
<pre><code>1 + 2 + 4 + 8 + ... + n  =  2n − 1   (a geometric series)
total work for n appends ≈ 3n  →  O(1) amortised each</code></pre>
<h2>The three amortised methods</h2>
<ol>
<li><strong>Aggregate</strong> — total cost ÷ number of operations (used above).</li>
<li><strong>Accounting</strong> — each cheap op "banks" a credit; expensive ops spend the saved credits.</li>
<li><strong>Potential</strong> — define a potential function Φ representing stored-up work.</li>
</ol>
<h2>Other amortised-O(1) results</h2>
<ul>
<li>Stack with multipop (each element is pushed and popped at most once)</li>
<li>Union-Find with path compression + union by rank → ~O(1) per operation</li>
<li>Incrementing a binary counter</li>
</ul>
<blockquote><strong>Interview answer:</strong> "Why is ArrayList.add() O(1)?" → "O(1) <em>amortised</em> — resizes are rare and their total cost, spread across all the cheap appends, averages to a constant."</blockquote>`,
  },
  {
    title: "Recurrence relations — substitution, recursion tree, Master Theorem",
    html: `<p>A recursive algorithm describes its own running time as a <strong>recurrence</strong> — T(n) in terms of T of smaller inputs. Solving the recurrence gives the closed-form complexity.</p>
<h2>Recurrences you must recognise on sight</h2>
<table>
<thead><tr><th>Recurrence</th><th>Algorithm</th><th>Solution</th></tr></thead>
<tbody>
<tr><td>T(n) = T(n−1) + O(1)</td><td>linear recursion</td><td>O(n)</td></tr>
<tr><td>T(n) = 2T(n/2) + O(n)</td><td>merge sort</td><td>O(n log n)</td></tr>
<tr><td>T(n) = T(n/2) + O(1)</td><td>binary search</td><td>O(log n)</td></tr>
<tr><td>T(n) = 2T(n−1) + O(1)</td><td>Tower of Hanoi</td><td>O(2ⁿ)</td></tr>
</tbody>
</table>
<h2>Method 1 — the recursion tree</h2>
<p>Draw the calls as a tree; each node is the <em>non-recursive</em> work done at that call. Sum every level, then multiply by the number of levels. For merge sort T(n) = 2T(n/2) + n:</p>
${dotSvg(`shape=box;
n0[label="n", shape=box]; n0->a1; n0->a2;
a1[label="n/2", shape=box]; a2[label="n/2", shape=box];
a1->b1; a1->b2; a2->b3; a2->b4;
b1[label="n/4", shape=box]; b2[label="n/4", shape=box]; b3[label="n/4", shape=box]; b4[label="n/4", shape=box];`,
    { caption: "Each level sums to n (top: n; next: n/2 + n/2 = n; next: 4 × n/4 = n). There are log₂n levels, so total = n × log n = O(n log n)." })}
<h2>Method 2 — the Master Theorem</h2>
<p>For divide-and-conquer recurrences of the form <strong>T(n) = a·T(n/b) + O(nᶜ)</strong> (a ≥ 1, b &gt; 1), compare <em>c</em> with <strong>log_b(a)</strong>:</p>
<table>
<thead><tr><th>Condition</th><th>Result</th><th>Who wins</th></tr></thead>
<tbody>
<tr><td>c &lt; log_b a</td><td>O(n^(log_b a))</td><td>leaves dominate</td></tr>
<tr><td>c = log_b a</td><td>O(nᶜ log n)</td><td>balanced — every level equal</td></tr>
<tr><td>c &gt; log_b a</td><td>O(nᶜ)</td><td>root dominates</td></tr>
</tbody>
</table>
<p><strong>Worked example (merge sort):</strong> a = 2, b = 2, c = 1. log₂2 = 1 = c → middle case → <strong>O(n¹ log n) = O(n log n)</strong>. ✓</p>
<p><strong>Worked example (binary search):</strong> a = 1, b = 2, c = 0. log₂1 = 0 = c → <strong>O(n⁰ log n) = O(log n)</strong>. ✓</p>
<h2>Method 3 — substitution</h2>
<p>Guess the answer and prove it by induction. For T(n) = 2T(n/2) + n, guess T(n) ≤ c·n·log n and verify the inductive step holds.</p>
<blockquote><strong>GATE favourite:</strong> applying the Master Theorem is a guaranteed exam question. Memorise the three cases and be fluent computing log_b(a).</blockquote>`,
  },
];

async function writeChapter(chapterId: string, subs: typeof SUBTOPICS) {
  const ref = db.collection("courses").doc("data-structures-algorithms").collection("chapters").doc(chapterId);
  const snap = await ref.get();
  if (!snap.exists) { console.log(`SKIP ${chapterId} — not found`); return; }
  const byTitle = new Map(subs.map((s) => [s.title, s.html]));
  const subtopics = (snap.data()!.subtopics || []).map((s: any) =>
    byTitle.has(s.title) ? { ...s, contentHtml: byTitle.get(s.title) } : s
  );
  const wrote = (snap.data()!.subtopics || []).filter((s: any) => byTitle.has(s.title)).map((s: any) => s.title);
  await ref.update({ subtopics, updatedAt: Timestamp.now() });
  console.log(`✓ ${chapterId}: updated ${wrote.length}/${subs.length} subtopics`);
  for (const t of subs) if (!wrote.includes(t.title)) console.log(`  WARN not matched: ${t.title}`);
}

(async () => {
  console.log("[dsa ch1] writing improved content + diagrams to prod...");
  await writeChapter("ch-foundations-complexity-analysis", SUBTOPICS);
  console.log("done.");
  process.exit(0);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
