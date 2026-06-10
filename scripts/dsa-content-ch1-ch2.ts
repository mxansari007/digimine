/**
 * DSA content — Chapter 1 (Foundations) + Chapter 2 (Arrays & Strings)
 * Run from repo root:
 *   FIRESTORE_EMULATOR_HOST= FIREBASE_AUTH_EMULATOR_HOST= \
 *   FIREBASE_STORAGE_EMULATOR_HOST= NEXT_PUBLIC_USE_FIREBASE_EMULATORS= \
 *   pnpm tsx scripts/dsa-content-ch1-ch2.ts
 */
import { config } from "dotenv";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
config({ path: "/Users/maazansari/digimine/apps/web/.env.local" });
const pid = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
if (!getApps().length) initializeApp({ credential: cert({ projectId: pid, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!, privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n") }) });
const db = getFirestore();

// Subtopic slug = title slugified (mirrors subtopicSlug() in chapter.tsx)
function slug(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const CONTENT: Array<{ chapterId: string; subtopics: Array<{ title: string; html: string }> }> = [
  {
    chapterId: "ch-foundations-complexity-analysis",
    subtopics: [
      {
        title: "Why DSA? Solving problems efficiently",
        html: `<p>Data Structures and Algorithms (DSA) are the building blocks of efficient software. A <strong>data structure</strong> organises data in memory so that it can be accessed and modified quickly. An <strong>algorithm</strong> is a finite set of well-defined steps to solve a specific problem.</p>
<h2>Why efficiency matters</h2>
<p>Consider searching for a name in a phone book with 1 billion entries. A <strong>linear scan</strong> checks every entry — up to 1 billion comparisons. <strong>Binary search</strong> halves the problem each step — only ~30 comparisons. Same input, astronomically different runtime.</p>
<h2>Real-world impact</h2>
<ul>
<li>Google's search index uses inverted indexes + sophisticated ranking algorithms</li>
<li>GPS navigation uses Dijkstra's shortest-path algorithm</li>
<li>Databases use B-trees to index millions of rows for O(log n) lookups</li>
<li>Compilers use stacks for expression evaluation and call management</li>
</ul>
<h2>The DSA mindset</h2>
<p>Every problem has a <strong>brute-force</strong> solution (try all possibilities) and usually a smarter one. DSA teaches you to:</p>
<ol>
<li>Identify the right data structure for the access pattern</li>
<li>Choose an algorithm that avoids redundant work</li>
<li>Prove correctness and analyse resource usage before coding</li>
</ol>
<h2>Key exam point</h2>
<p>Interviewers measure your ability to spot when a naive solution is too slow and propose an optimised alternative — this is the core skill DSA builds.</p>`,
      },
      {
        title: "Time complexity — Big-O, Big-Ω, Big-Θ notation",
        html: `<p>Complexity notation describes how an algorithm's resource usage grows as input size <em>n</em> grows, independent of hardware or implementation constants.</p>
<h2>The three asymptotic notations</h2>
<table>
<thead><tr><th>Notation</th><th>Meaning</th><th>Intuition</th></tr></thead>
<tbody>
<tr><td><strong>O(f(n))</strong></td><td>Upper bound</td><td>Algorithm runs <em>at most</em> this fast (worst case)</td></tr>
<tr><td><strong>Ω(f(n))</strong></td><td>Lower bound</td><td>Algorithm runs <em>at least</em> this slow (best case)</td></tr>
<tr><td><strong>Θ(f(n))</strong></td><td>Tight bound</td><td>Algorithm runs <em>exactly</em> this order (avg case)</td></tr>
</tbody>
</table>
<h2>Common complexities (fastest → slowest)</h2>
<table>
<thead><tr><th>Complexity</th><th>Name</th><th>Example</th></tr></thead>
<tbody>
<tr><td>O(1)</td><td>Constant</td><td>Array index access</td></tr>
<tr><td>O(log n)</td><td>Logarithmic</td><td>Binary search</td></tr>
<tr><td>O(n)</td><td>Linear</td><td>Linear scan</td></tr>
<tr><td>O(n log n)</td><td>Linearithmic</td><td>Merge sort</td></tr>
<tr><td>O(n²)</td><td>Quadratic</td><td>Bubble sort</td></tr>
<tr><td>O(2ⁿ)</td><td>Exponential</td><td>All subsets</td></tr>
<tr><td>O(n!)</td><td>Factorial</td><td>All permutations</td></tr>
</tbody>
</table>
<h2>How to read Big-O</h2>
<pre><code>// O(n) — one loop over input
for (int i = 0; i &lt; n; i++) { ... }

// O(n²) — nested loops
for (int i = 0; i &lt; n; i++)
  for (int j = 0; j &lt; n; j++) { ... }

// O(log n) — halving each iteration
while (lo &lt;= hi) { mid = (lo+hi)/2; ... }</code></pre>
<h2>Drop constants and lower-order terms</h2>
<p>O(3n + 100) simplifies to <strong>O(n)</strong>. O(n² + n) simplifies to <strong>O(n²)</strong>. Only the dominant term matters at large n.</p>
<h2>Key exam point</h2>
<p>In interviews, always state the time <em>and</em> space complexity of your solution. Use O (worst case) by default unless asked for best or average.</p>`,
      },
      {
        title: "Space complexity — auxiliary vs total space",
        html: `<p>Space complexity measures the amount of memory an algorithm uses relative to input size <em>n</em>. It has two components:</p>
<ul>
<li><strong>Input space</strong> — memory occupied by the input itself</li>
<li><strong>Auxiliary space</strong> — extra memory the algorithm allocates (excluding input)</li>
</ul>
<p>In most interviews, <strong>auxiliary space</strong> is what matters.</p>
<h2>Examples</h2>
<table>
<thead><tr><th>Algorithm</th><th>Auxiliary Space</th><th>Reason</th></tr></thead>
<tbody>
<tr><td>In-place bubble sort</td><td>O(1)</td><td>Only a swap variable</td></tr>
<tr><td>Merge sort</td><td>O(n)</td><td>Needs a temp merge array</td></tr>
<tr><td>Recursive DFS on tree of height h</td><td>O(h)</td><td>Call stack depth = h</td></tr>
<tr><td>BFS with queue</td><td>O(w)</td><td>w = max width of the tree/graph</td></tr>
<tr><td>Memoised DP (n states)</td><td>O(n)</td><td>Cache array</td></tr>
</tbody>
</table>
<h2>The recursion stack</h2>
<p>Every recursive call occupies a stack frame. A recursive algorithm with depth <em>d</em> uses <strong>O(d)</strong> stack space even if it allocates nothing else. For binary search, d = log n; for an unbalanced BST traversal, d can be O(n).</p>
<h2>Space-time trade-off</h2>
<p>A faster algorithm often uses more memory. Hash maps give O(1) average lookup at the cost of O(n) space. Sorting in-place saves space but may be slower or less stable.</p>
<h2>Key exam point</h2>
<p>When asked to "optimise" a solution, clarify whether the interviewer wants better time or better space — these often conflict.</p>`,
      },
      {
        title: "Best, average, worst case analysis",
        html: `<p>The same algorithm can behave very differently on different inputs. Case analysis captures this variability.</p>
<h2>Three cases</h2>
<table>
<thead><tr><th>Case</th><th>Meaning</th><th>Linear search example</th></tr></thead>
<tbody>
<tr><td><strong>Best case</strong></td><td>Most favourable input</td><td>Target is the first element → O(1)</td></tr>
<tr><td><strong>Average case</strong></td><td>Expected over all inputs</td><td>Target is in the middle on average → O(n/2) = O(n)</td></tr>
<tr><td><strong>Worst case</strong></td><td>Most adversarial input</td><td>Target is last or absent → O(n)</td></tr>
</tbody>
</table>
<h2>Why worst case dominates</h2>
<p>Software systems must <em>guarantee</em> latency bounds. A web server that is fast 99% of the time but occasionally hangs for 10 seconds is unusable. Hence we design and analyse for <strong>worst case</strong>.</p>
<h2>Quick Sort: a classic case study</h2>
<ul>
<li><strong>Best/average case:</strong> O(n log n) — pivots split arrays roughly in half</li>
<li><strong>Worst case:</strong> O(n²) — pivot is always the min or max (already sorted input with naive pivot choice)</li>
</ul>
<p>This is why randomised or median-of-3 pivot selection is used in practice.</p>
<h2>Average case and probability</h2>
<p>Average-case analysis assumes a probability distribution over inputs (often uniform). Hash table lookup is O(1) <em>on average</em> under the assumption of a good hash function, but O(n) in the worst case (all keys collide into one bucket).</p>
<h2>Key exam point</h2>
<p>State which case your complexity applies to. "O(n log n)" alone is ambiguous — say "O(n log n) average, O(n²) worst" for Quick Sort.</p>`,
      },
      {
        title: "Amortised analysis — dynamic array example",
        html: `<p>Amortised analysis calculates the <em>average cost per operation</em> in a sequence of operations, even when some individual operations are expensive. It is not the same as average-case analysis — it makes no probabilistic assumptions.</p>
<h2>Dynamic array (ArrayList / Python list)</h2>
<p>A dynamic array starts with capacity 1 and doubles when full. Consider inserting n elements:</p>
<ul>
<li>Most insertions cost O(1) (just writing to the next slot)</li>
<li>Occasionally a resize copies all elements: O(1) + O(2) + O(4) + … + O(n) ≈ O(2n) total</li>
</ul>
<p>Total work for n inserts = O(2n), so <strong>amortised cost per insert = O(1)</strong>.</p>
<h2>The accounting method</h2>
<p>Think of each cheap insertion "banking" extra credits. When an expensive resize happens, those credits pay for it. No single insert is ever charged more than O(1) amortised.</p>
<h2>Three amortised methods</h2>
<ol>
<li><strong>Aggregate method</strong> — total cost / n operations</li>
<li><strong>Accounting method</strong> — assign credits to cheap ops, spend on expensive ops</li>
<li><strong>Potential method</strong> — define a potential function Φ representing stored work</li>
</ol>
<h2>Other amortised O(1) examples</h2>
<ul>
<li>Stack operations with multipop (each element pushed/popped at most once)</li>
<li>Fibonacci heap decrease-key</li>
<li>Union-Find with path compression + union by rank</li>
</ul>
<h2>Key exam point</h2>
<p>When an interviewer asks "why is ArrayList.add() O(1)?", the correct answer is "O(1) <em>amortised</em> — resizes are rare and their cost spreads across all insertions."</p>`,
      },
      {
        title: "Recurrence relations — substitution, recursion tree, Master Theorem",
        html: `<p>Recursive algorithms express their runtime as a recurrence. Solving it gives the closed-form complexity.</p>
<h2>Common recurrences</h2>
<table>
<thead><tr><th>Recurrence</th><th>Algorithm</th><th>Solution</th></tr></thead>
<tbody>
<tr><td>T(n) = T(n-1) + O(1)</td><td>Factorial</td><td>O(n)</td></tr>
<tr><td>T(n) = 2T(n/2) + O(n)</td><td>Merge Sort</td><td>O(n log n)</td></tr>
<tr><td>T(n) = T(n/2) + O(1)</td><td>Binary Search</td><td>O(log n)</td></tr>
<tr><td>T(n) = 2T(n-1) + O(1)</td><td>Tower of Hanoi</td><td>O(2ⁿ)</td></tr>
</tbody>
</table>
<h2>Master Theorem</h2>
<p>For T(n) = aT(n/b) + O(nᶜ) where a ≥ 1, b > 1:</p>
<ul>
<li>If c &lt; log_b(a): <strong>T(n) = O(n^log_b(a))</strong> — recursion dominates</li>
<li>If c = log_b(a): <strong>T(n) = O(nᶜ log n)</strong> — equal work each level</li>
<li>If c > log_b(a): <strong>T(n) = O(nᶜ)</strong> — root work dominates</li>
</ul>
<p>Example: Merge Sort has a=2, b=2, c=1 → log_2(2)=1 = c → <strong>O(n log n)</strong>.</p>
<h2>Recursion tree method</h2>
<p>Draw the recursion as a tree. Each node is the non-recursive work at that call. Sum all levels:</p>
<pre><code>T(n) = 2T(n/2) + n
Level 0: n          (1 node, n work)
Level 1: n/2+n/2=n  (2 nodes, n/2 each)
Level 2: n          (4 nodes, n/4 each)
...
log n levels × n work = O(n log n)</code></pre>
<h2>Substitution method</h2>
<p>Guess the answer, then prove by induction. For T(n) = 2T(n/2) + n, guess O(n log n) and verify T(n) ≤ cn log n holds if T(n/2) ≤ c(n/2)log(n/2).</p>
<h2>Key exam point</h2>
<p>GATE and company tests frequently ask you to apply Master Theorem — memorise the three cases and be comfortable with log_b(a).</p>`,
      },
    ],
  },
  {
    chapterId: "ch-arrays-strings",
    subtopics: [
      {
        title: "Array internals — memory layout, cache friendliness",
        html: `<p>An array stores elements in <strong>contiguous memory</strong>. Element at index <em>i</em> is at address: <code>base + i × element_size</code>. This makes index access O(1).</p>
<h2>Memory layout</h2>
<pre><code>int arr[5] = {10, 20, 30, 40, 50};
// Memory: [10][20][30][40][50] at addresses 100, 104, 108, 112, 116
// arr[3] → 100 + 3×4 = 112  (one multiplication + addition)</code></pre>
<h2>Cache friendliness</h2>
<p>Modern CPUs have L1/L2/L3 caches. When you read one memory location, the CPU prefetches nearby bytes into cache (a <strong>cache line</strong>, typically 64 bytes). Sequential array traversal hits cache almost every time — a <strong>cache hit</strong> is ~4 cycles vs ~100 cycles for a cache miss.</p>
<p>This is why iterating an array is faster than following linked-list pointers in practice, even when both are O(n) asymptotically.</p>
<h2>Row-major vs column-major</h2>
<p>In a 2D array, iterating <strong>row by row</strong> (C/Java default) is cache-friendly. Iterating column by column skips large memory gaps, causing cache misses.</p>
<pre><code>// Cache-friendly (row-major traversal)
for i in range(rows):
  for j in range(cols): process(arr[i][j])

// Cache-unfriendly (column-major traversal)
for j in range(cols):
  for i in range(rows): process(arr[i][j])</code></pre>
<h2>Static vs dynamic arrays</h2>
<ul>
<li><strong>Static array</strong> — fixed size at compile time, stack-allocated, no overhead</li>
<li><strong>Dynamic array</strong> (ArrayList, vector) — heap-allocated, grows by doubling, O(1) amortised append</li>
</ul>
<h2>Key exam point</h2>
<p>Cache performance distinguishes arrays (cache-friendly) from hash maps (scattered memory) and linked lists (pointer chasing) in practice — relevant for system-design discussions.</p>`,
      },
      {
        title: "Two-pointer technique — pair sum, triplet sum, remove duplicates",
        html: `<p>Two pointers maintain two indices into an array and move them toward each other (or in the same direction) to avoid O(n²) nested loops. Works best on <strong>sorted</strong> arrays.</p>
<h2>Pattern 1 — opposite ends (pair sum)</h2>
<p>Find if any pair sums to target in a sorted array.</p>
<pre><code>def pair_sum(arr, target):
    lo, hi = 0, len(arr) - 1
    while lo &lt; hi:
        s = arr[lo] + arr[hi]
        if s == target: return (lo, hi)
        elif s &lt; target: lo += 1   # need larger
        else: hi -= 1              # need smaller
    return None
# Time: O(n)  Space: O(1)</code></pre>
<h2>Pattern 2 — triplet sum (3Sum)</h2>
<p>Fix one element, then run pair-sum on the rest: O(n²) total.</p>
<pre><code>def three_sum(arr, target):
    arr.sort()
    results = []
    for i in range(len(arr) - 2):
        lo, hi = i+1, len(arr)-1
        while lo &lt; hi:
            s = arr[i] + arr[lo] + arr[hi]
            if s == target: results.append((arr[i],arr[lo],arr[hi])); lo+=1; hi-=1
            elif s &lt; target: lo += 1
            else: hi -= 1
    return results</code></pre>
<h2>Pattern 3 — same direction (remove duplicates)</h2>
<p>Keep a slow pointer <em>write</em> and a fast pointer <em>read</em>.</p>
<pre><code>def remove_duplicates(arr):
    if not arr: return 0
    write = 1
    for read in range(1, len(arr)):
        if arr[read] != arr[write - 1]:
            arr[write] = arr[read]; write += 1
    return write   # O(n) time, O(1) space</code></pre>
<h2>Key exam point</h2>
<p>Always sort first for two-pointer pair/triplet problems. The technique is applicable to: container with most water, trapping rain water, Dutch national flag, merging sorted arrays.</p>`,
      },
      {
        title: "Sliding window — fixed & variable size (max subarray sum, longest substring)",
        html: `<p>A sliding window maintains a <strong>contiguous subarray</strong> of interest. Instead of recomputing from scratch, it adjusts by adding the new right element and removing the old left element — typically O(n) instead of O(n²).</p>
<h2>Fixed-size window — max sum of k consecutive elements</h2>
<pre><code>def max_sum_k(arr, k):
    window = sum(arr[:k])
    best = window
    for i in range(k, len(arr)):
        window += arr[i] - arr[i-k]  # slide right
        best = max(best, window)
    return best   # O(n) time, O(1) space</code></pre>
<h2>Variable-size window — longest substring without repeating characters</h2>
<p>Expand right; shrink left when the window becomes invalid.</p>
<pre><code>def length_of_longest_substring(s):
    seen = {}
    lo = best = 0
    for hi, ch in enumerate(s):
        if ch in seen and seen[ch] >= lo:
            lo = seen[ch] + 1     # shrink left past the duplicate
        seen[ch] = hi
        best = max(best, hi - lo + 1)
    return best   # O(n) time, O(1) space (26 chars)</code></pre>
<h2>Recognising sliding window problems</h2>
<ul>
<li>Contiguous subarray / substring</li>
<li>Maximise / minimise a value within a window</li>
<li>Condition on the window contents (at most k distinct, sum ≤ target, etc.)</li>
</ul>
<h2>Common problems</h2>
<ul>
<li>Max sum subarray of size k</li>
<li>Longest substring with at most k distinct characters</li>
<li>Minimum window substring (contains all chars of pattern)</li>
<li>Find all anagrams of a pattern in a string</li>
</ul>
<h2>Key exam point</h2>
<p>Two pointers + a hash map / frequency array cover almost all sliding window problems. The template is always: expand right → check validity → shrink left.</p>`,
      },
      {
        title: "Prefix sums & difference arrays",
        html: `<p>Prefix sums allow <strong>O(1) range sum queries</strong> after O(n) preprocessing. Difference arrays allow <strong>O(1) range updates</strong> with O(n) reconstruction.</p>
<h2>Prefix sum — range sum query</h2>
<pre><code>arr   = [3, 1, 4, 1, 5, 9, 2, 6]
prefix= [0, 3, 4, 8, 9,14,23,25,31]  # prefix[i] = sum of arr[0..i-1]

# Sum from index l to r (inclusive, 0-indexed):
range_sum(l, r) = prefix[r+1] - prefix[l]   # O(1)</code></pre>
<h2>2D prefix sum — submatrix sum</h2>
<pre><code># Build:  P[i][j] = P[i-1][j] + P[i][j-1] - P[i-1][j-1] + A[i][j]
# Query: sum of rectangle (r1,c1)→(r2,c2):
#   P[r2][c2] - P[r1-1][c2] - P[r2][c1-1] + P[r1-1][c1-1]</code></pre>
<h2>Difference array — range increment</h2>
<p>Add <em>v</em> to all elements in [l, r] in O(1). Reconstruct in O(n).</p>
<pre><code>diff = [0] * (n+1)

def range_add(l, r, v):
    diff[l] += v
    diff[r+1] -= v

# Reconstruct original array after all updates:
running = 0
for i in range(n):
    running += diff[i]
    arr[i] = running</code></pre>
<h2>Common problems</h2>
<ul>
<li>Subarray sum equals k — prefix sum + hash map</li>
<li>Range update, point query — difference array</li>
<li>Number of subarrays with even sum</li>
<li>Equilibrium index (sum left == sum right)</li>
</ul>
<h2>Key exam point</h2>
<p>"Subarray sum = k" is a classic interview problem solved in O(n) using prefix sums + a hash map counting how many times each prefix sum has appeared.</p>`,
      },
      {
        title: "Kadane's Algorithm — maximum subarray",
        html: `<p>Kadane's algorithm finds the contiguous subarray with the maximum sum in <strong>O(n) time and O(1) space</strong>. It's a foundational DP pattern.</p>
<h2>Core idea</h2>
<p>At each index, decide: should the current element <em>extend</em> the previous subarray, or <em>start a new</em> one? It's never beneficial to carry a negative running sum into the next element.</p>
<pre><code>def max_subarray(nums):
    cur = best = nums[0]
    for x in nums[1:]:
        cur = max(x, cur + x)   # extend or restart
        best = max(best, cur)
    return best

# nums = [-2, 1, -3, 4, -1, 2, 1, -5, 4]
# cur  = [-2, 1, -2, 4,  3, 5, 6,  1, 5]  → answer = 6  (subarray [4,-1,2,1])</code></pre>
<h2>Return the actual subarray</h2>
<pre><code>def max_subarray_with_indices(nums):
    cur = best = nums[0]
    start = end = temp_start = 0
    for i in range(1, len(nums)):
        if nums[i] > cur + nums[i]:
            cur = nums[i]; temp_start = i
        else:
            cur += nums[i]
        if cur > best:
            best = cur; start = temp_start; end = i
    return best, start, end</code></pre>
<h2>Variants</h2>
<ul>
<li><strong>Maximum circular subarray</strong> — max of (Kadane normal, total_sum − Kadane on negated array)</li>
<li><strong>Maximum product subarray</strong> — track both max and min (because negative × negative = positive)</li>
<li><strong>At least k elements</strong> — prefix sum trick</li>
</ul>
<h2>Key exam point</h2>
<p>Kadane's is the canonical O(n) solution to LC #53 (Maximum Subarray). The DP recurrence is: <code>dp[i] = max(nums[i], dp[i-1] + nums[i])</code>.</p>`,
      },
      {
        title: "Binary search on arrays — lower_bound, upper_bound, rotated arrays",
        html: `<p>Binary search halves the search space each iteration — O(log n) time, O(1) space. Applies to any <strong>monotone predicate</strong> (sorted arrays, search on answer).</p>
<h2>Standard binary search</h2>
<pre><code>def binary_search(arr, target):
    lo, hi = 0, len(arr) - 1
    while lo &lt;= hi:
        mid = lo + (hi - lo) // 2      # avoid overflow
        if arr[mid] == target: return mid
        elif arr[mid] &lt; target: lo = mid + 1
        else: hi = mid - 1
    return -1</code></pre>
<h2>lower_bound — first position ≥ target</h2>
<pre><code>def lower_bound(arr, target):
    lo, hi = 0, len(arr)
    while lo &lt; hi:
        mid = (lo + hi) // 2
        if arr[mid] &lt; target: lo = mid + 1
        else: hi = mid
    return lo   # index of first element >= target</code></pre>
<h2>upper_bound — first position > target</h2>
<pre><code>def upper_bound(arr, target):
    lo, hi = 0, len(arr)
    while lo &lt; hi:
        mid = (lo + hi) // 2
        if arr[mid] &lt;= target: lo = mid + 1
        else: hi = mid
    return lo   # count of elements <= target = upper_bound(target)</code></pre>
<h2>Rotated sorted array</h2>
<p>Array [4,5,6,7,0,1,2] was rotated. One half is always sorted.</p>
<pre><code>def search_rotated(arr, target):
    lo, hi = 0, len(arr) - 1
    while lo &lt;= hi:
        mid = (lo + hi) // 2
        if arr[mid] == target: return mid
        if arr[lo] &lt;= arr[mid]:          # left half sorted
            if arr[lo] &lt;= target &lt; arr[mid]: hi = mid - 1
            else: lo = mid + 1
        else:                             # right half sorted
            if arr[mid] &lt; target &lt;= arr[hi]: lo = mid + 1
            else: hi = mid - 1
    return -1</code></pre>
<h2>Key exam point</h2>
<p>Use <code>lo + (hi - lo) // 2</code> (not <code>(lo+hi)//2</code>) to prevent integer overflow in Java/C++. The lower_bound template is the most versatile — almost all binary search variants reduce to it.</p>`,
      },
      {
        title: "String fundamentals — immutability, character arrays",
        html: `<p>Strings are sequences of characters. Understanding their memory model is essential for writing efficient string algorithms.</p>
<h2>Immutability</h2>
<p>In <strong>Java</strong> and <strong>Python</strong>, strings are immutable — you cannot change a character in place. Concatenation creates a new string object:</p>
<pre><code># Python — O(n²) naive concatenation
result = ""
for ch in arr:
    result += ch    # creates a new string each time!

# O(n) — use join
result = "".join(arr)</code></pre>
<p>In <strong>C++</strong>, <code>std::string</code> is mutable. In <strong>Java</strong>, use <code>StringBuilder</code> for O(n) building.</p>
<h2>Character encoding</h2>
<ul>
<li><strong>ASCII</strong> — 128 characters, 7 bits, covers A-Z, a-z, 0-9, symbols</li>
<li><strong>Unicode / UTF-8</strong> — millions of characters, variable byte width</li>
</ul>
<p>In interview problems, clarify: "Can input contain only lowercase letters? Only ASCII?" A frequency array of size 26 works for lowercase ASCII; use a hash map for Unicode.</p>
<h2>Useful character operations</h2>
<pre><code># Check if char is letter / digit
c.isalpha(), c.isdigit(), c.isalnum()

# Case conversion
c.lower(), c.upper()

# ASCII value
ord('A') = 65, ord('a') = 97
chr(65) = 'A'

# Index in alphabet (0-based)
ord(c) - ord('a')   # 0 for 'a', 25 for 'z'</code></pre>
<h2>Key operations and their complexity</h2>
<table>
<thead><tr><th>Operation</th><th>Python</th><th>Java (StringBuilder)</th></tr></thead>
<tbody>
<tr><td>Index access s[i]</td><td>O(1)</td><td>O(1)</td></tr>
<tr><td>Length len(s)</td><td>O(1)</td><td>O(1)</td></tr>
<tr><td>Concatenation s+t</td><td>O(n+m)</td><td>O(1) amortised</td></tr>
<tr><td>Substring s[l:r]</td><td>O(r-l)</td><td>O(r-l)</td></tr>
</tbody>
</table>
<h2>Key exam point</h2>
<p>Never build a result string inside a loop using <code>+=</code> — it's O(n²). Always collect into a list/StringBuilder and join/toString at the end.</p>`,
      },
      {
        title: "String pattern matching — naive, KMP algorithm",
        html: `<p>String pattern matching finds all occurrences of a pattern <em>P</em> (length m) inside text <em>T</em> (length n).</p>
<h2>Naive approach — O(nm)</h2>
<pre><code>def naive_search(text, pattern):
    n, m = len(text), len(pattern)
    for i in range(n - m + 1):
        if text[i:i+m] == pattern:
            print(f"Match at index {i}")
# Worst case: T="aaaaaa", P="aaab" → O(nm)</code></pre>
<h2>KMP (Knuth-Morris-Pratt) — O(n + m)</h2>
<p>KMP avoids redundant comparisons by precomputing a <strong>failure function</strong> (also called LPS — Longest Proper Prefix which is also Suffix) for the pattern.</p>
<pre><code>def build_lps(pattern):
    m = len(pattern)
    lps = [0] * m
    length = 0; i = 1
    while i &lt; m:
        if pattern[i] == pattern[length]:
            length += 1; lps[i] = length; i += 1
        elif length:
            length = lps[length - 1]   # fall back
        else:
            lps[i] = 0; i += 1
    return lps

def kmp_search(text, pattern):
    n, m = len(text), len(pattern)
    lps = build_lps(pattern)
    i = j = 0   # i → text, j → pattern
    while i &lt; n:
        if text[i] == pattern[j]:
            i += 1; j += 1
        if j == m:
            print(f"Match at {i - j}"); j = lps[j-1]
        elif i &lt; n and text[i] != pattern[j]:
            if j: j = lps[j-1]
            else: i += 1</code></pre>
<h2>Why KMP works</h2>
<p>The LPS table tells us: after a mismatch at pattern[j], how much of the pattern we've already matched can be reused. We never re-examine characters of T that we've already passed.</p>
<h2>Other algorithms</h2>
<ul>
<li><strong>Rabin-Karp</strong> — rolling hash, O(n+m) average, used for multiple pattern search</li>
<li><strong>Boyer-Moore</strong> — fastest in practice, O(n/m) best case</li>
<li><strong>Z-algorithm</strong> — O(n+m), simpler than KMP, useful in competitive programming</li>
</ul>
<h2>Key exam point</h2>
<p>KMP is a GATE favourite. Know how to build the LPS array manually and trace through a search. The LPS for "AABAAB" is [0,1,0,1,2,3].</p>`,
      },
      {
        title: "Anagram, palindrome & frequency-map problems",
        html: `<p>A large class of string problems reduces to counting character frequencies. Master the frequency-map pattern and it unlocks dozens of problems.</p>
<h2>Frequency map</h2>
<pre><code>from collections import Counter

# Count chars
freq = Counter("programming")
# {'r': 2, 'g': 2, 'm': 2, 'p': 1, 'o': 1, 'a': 1, 'i': 1, 'n': 1}

# Fixed-size array (lowercase only, faster)
freq = [0] * 26
for ch in s: freq[ord(ch) - ord('a')] += 1</code></pre>
<h2>Anagram check</h2>
<pre><code>def is_anagram(s, t):
    return len(s) == len(t) and Counter(s) == Counter(t)
# O(n) time, O(1) space (bounded alphabet)</code></pre>
<h2>Group anagrams</h2>
<pre><code>def group_anagrams(strs):
    groups = {}
    for s in strs:
        key = tuple(sorted(s))          # O(k log k)
        groups.setdefault(key, []).append(s)
    return list(groups.values())         # O(nk log k) total</code></pre>
<h2>Palindrome check</h2>
<pre><code>def is_palindrome(s):
    s = ''.join(c.lower() for c in s if c.isalnum())
    return s == s[::-1]   # O(n)</code></pre>
<h2>Valid palindrome II (delete at most one character)</h2>
<pre><code>def valid_palindrome_ii(s):
    def is_pal(l, r): return s[l:r+1] == s[l:r+1][::-1]
    lo, hi = 0, len(s) - 1
    while lo &lt; hi:
        if s[lo] == s[hi]: lo += 1; hi -= 1
        else: return is_pal(lo+1, hi) or is_pal(lo, hi-1)
    return True</code></pre>
<h2>Key exam point</h2>
<p>If a problem asks whether a string can form a palindrome: a string with at most one odd-frequency character can form a palindrome (use one char in the middle). This is checked in O(n) with a frequency array.</p>`,
      },
    ],
  },
];

async function writeSubtopicContent(chapterId: string, subtopicTitle: string, html: string) {
  const chapterRef = db.collection("courses").doc("data-structures-algorithms").collection("chapters").doc(chapterId);
  const snap = await chapterRef.get();
  if (!snap.exists) { console.log(`  SKIP ${chapterId} — not found`); return false; }
  const chapter = snap.data()!;
  const subtopics = (chapter.subtopics || []).map((s: any) => {
    if (s.title === subtopicTitle) return { ...s, contentHtml: html };
    return s;
  });
  const matched = subtopics.some((s: any) => s.title === subtopicTitle && s.contentHtml === html);
  if (!matched) { console.log(`  WARN: subtopic "${subtopicTitle}" not found in ${chapterId}`); return false; }
  await chapterRef.update({ subtopics, updatedAt: Timestamp.now() });
  return true;
}

(async () => {
  console.log("[dsa-content ch1-ch2] writing to prod...");
  let updated = 0;
  for (const ch of CONTENT) {
    console.log(`\n${ch.chapterId}:`);
    for (const sub of ch.subtopics) {
      const ok = await writeSubtopicContent(ch.chapterId, sub.title, sub.html);
      if (ok) { updated++; console.log(`  ✓ ${sub.title}`); }
    }
  }
  console.log(`\nDone — ${updated} subtopics updated.`);
  process.exit(0);
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
