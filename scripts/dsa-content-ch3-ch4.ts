import { config } from "dotenv";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
config({ path: "/Users/maazansari/digimine/apps/web/.env.local" });
const pid = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
if (!getApps().length) initializeApp({ credential: cert({ projectId: pid, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!, privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n") }) });
const db = getFirestore();

const CONTENT: Array<{ chapterId: string; subtopics: Array<{ title: string; html: string }> }> = [
  {
    chapterId: "ch-linked-lists",
    subtopics: [
      {
        title: "Singly linked list — node structure, insertion, deletion, traversal",
        html: `<p>A singly linked list stores elements in <strong>non-contiguous</strong> nodes. Each node holds a value and a pointer to the next node. The list starts at a <code>head</code> pointer; the last node's <code>next</code> is <code>null</code>.</p>
<h2>Node structure</h2>
<pre><code>class Node:
    def __init__(self, val):
        self.val = val
        self.next = None

class LinkedList:
    def __init__(self):
        self.head = None</code></pre>
<h2>Insertion</h2>
<pre><code># Insert at head — O(1)
def push_front(self, val):
    node = Node(val); node.next = self.head; self.head = node

# Insert at tail — O(n) without tail pointer
def push_back(self, val):
    node = Node(val)
    if not self.head: self.head = node; return
    cur = self.head
    while cur.next: cur = cur.next
    cur.next = node

# Insert after a given node — O(1)
def insert_after(node, val):
    new = Node(val); new.next = node.next; node.next = new</code></pre>
<h2>Deletion</h2>
<pre><code># Delete by value — O(n)
def delete(self, val):
    dummy = Node(0); dummy.next = self.head; cur = dummy
    while cur.next:
        if cur.next.val == val: cur.next = cur.next.next; break
        cur = cur.next
    self.head = dummy.next</code></pre>
<h2>Traversal — O(n)</h2>
<pre><code>cur = self.head
while cur:
    print(cur.val); cur = cur.next</code></pre>
<h2>Complexity summary</h2>
<table>
<thead><tr><th>Operation</th><th>Time</th><th>Notes</th></tr></thead>
<tbody>
<tr><td>Access by index</td><td>O(n)</td><td>Must traverse from head</td></tr>
<tr><td>Insert at head</td><td>O(1)</td><td></td></tr>
<tr><td>Insert at tail</td><td>O(n) / O(1)</td><td>O(1) with tail pointer</td></tr>
<tr><td>Delete by value</td><td>O(n)</td><td>Search + O(1) re-link</td></tr>
</tbody>
</table>
<h2>Key exam point</h2>
<p>Always use a <strong>dummy head node</strong> for deletion — it eliminates the edge case of deleting the head and makes the code uniform.</p>`,
      },
      {
        title: "Doubly linked list — prev/next pointers, operations",
        html: `<p>A doubly linked list has two pointers per node: <code>next</code> (forward) and <code>prev</code> (backward). This enables O(1) deletion given a node reference and O(1) traversal in both directions.</p>
<h2>Node structure</h2>
<pre><code>class DNode:
    def __init__(self, val):
        self.val = val
        self.next = self.prev = None</code></pre>
<h2>Insertion at head — O(1)</h2>
<pre><code>def push_front(self, val):
    node = DNode(val)
    node.next = self.head
    if self.head: self.head.prev = node
    self.head = node
    if not self.tail: self.tail = node</code></pre>
<h2>Delete a given node — O(1)</h2>
<p>This is the key advantage over singly linked lists — given only a node reference, deletion is O(1).</p>
<pre><code>def delete_node(self, node):
    if node.prev: node.prev.next = node.next
    else: self.head = node.next           # deleting head
    if node.next: node.next.prev = node.prev
    else: self.tail = node.prev           # deleting tail</code></pre>
<h2>vs Singly linked list</h2>
<table>
<thead><tr><th>Feature</th><th>Singly</th><th>Doubly</th></tr></thead>
<tbody>
<tr><td>Memory per node</td><td>1 pointer</td><td>2 pointers</td></tr>
<tr><td>Reverse traversal</td><td>O(n) re-traverse</td><td>O(1) follow prev</td></tr>
<tr><td>Delete given node</td><td>O(n) find prev</td><td>O(1)</td></tr>
<tr><td>Insertion before node</td><td>O(n)</td><td>O(1)</td></tr>
</tbody>
</table>
<h2>Real-world uses</h2>
<ul>
<li>Browser history (back/forward)</li>
<li>LRU Cache implementation (doubly linked list + hash map)</li>
<li>Text editors (each line is a node)</li>
<li>Java's <code>LinkedList</code>, Python's <code>collections.deque</code></li>
</ul>
<h2>Key exam point</h2>
<p>LRU Cache (LC #146) combines a doubly linked list for O(1) eviction with a hash map for O(1) lookup — a classic doubly linked list application.</p>`,
      },
      {
        title: "Circular linked list",
        html: `<p>In a circular linked list, the last node's <code>next</code> points back to the head (singly circular) or the head's <code>prev</code> also points to the tail (doubly circular). There is no <code>null</code> terminator.</p>
<h2>Structure</h2>
<pre><code># Singly circular: tail.next = head
# Traversal — stop when you return to start
def traverse(self):
    if not self.head: return
    cur = self.head
    while True:
        print(cur.val)
        cur = cur.next
        if cur == self.head: break</code></pre>
<h2>Insertion at head</h2>
<pre><code>def push_front(self, val):
    node = Node(val)
    if not self.head:
        node.next = node   # points to itself
        self.head = node
        return
    # Find tail
    tail = self.head
    while tail.next != self.head: tail = tail.next
    node.next = self.head
    tail.next = node
    self.head = node</code></pre>
<h2>Applications</h2>
<ul>
<li><strong>Round-robin scheduling</strong> — cycle through processes without checking for null</li>
<li><strong>Multiplayer board games</strong> — players arranged in a circle</li>
<li><strong>Josephus problem</strong> — classic algorithm problem on circular elimination</li>
<li><strong>Music playlist loop</strong></li>
</ul>
<h2>Detecting a circular list</h2>
<p>Floyd's cycle detection (fast/slow pointers) works for arbitrary cycles, not just fully circular lists — covered in the next subtopic.</p>
<h2>Key exam point</h2>
<p>Circular linked list traversal must have an explicit stop condition (comparing to head). Forgetting this causes an infinite loop — a common bug in interviews.</p>`,
      },
      {
        title: "Reverse a linked list — iterative & recursive",
        html: `<p>Reversing a linked list is one of the most fundamental linked list operations — it appears as a subproblem in many harder problems (reverse in groups, reverse between positions, palindrome check).</p>
<h2>Iterative — O(n) time, O(1) space</h2>
<pre><code>def reverse(head):
    prev, cur = None, head
    while cur:
        nxt = cur.next    # save next
        cur.next = prev   # reverse pointer
        prev = cur        # advance prev
        cur = nxt         # advance cur
    return prev           # new head

# Trace: 1→2→3→null
# Step1: prev=null, cur=1 → 1→null, prev=1, cur=2
# Step2: prev=1,   cur=2 → 2→1→null, prev=2, cur=3
# Step3: prev=2,   cur=3 → 3→2→1→null, prev=3, cur=null
# Return prev=3 (new head)</code></pre>
<h2>Recursive — O(n) time, O(n) stack space</h2>
<pre><code>def reverse_recursive(head):
    if not head or not head.next:
        return head
    new_head = reverse_recursive(head.next)
    head.next.next = head   # node after head points back
    head.next = None        # head becomes tail
    return new_head</code></pre>
<h2>Reverse a sublist (positions l to r)</h2>
<pre><code>def reverse_between(head, l, r):
    dummy = ListNode(0); dummy.next = head; prev = dummy
    for _ in range(l - 1): prev = prev.next   # reach node before l
    cur = prev.next
    for _ in range(r - l):
        nxt = cur.next; cur.next = nxt.next
        nxt.next = prev.next; prev.next = nxt
    return dummy.next</code></pre>
<h2>Key exam point</h2>
<p>The iterative reversal uses three pointers: <code>prev</code>, <code>cur</code>, <code>nxt</code>. Drawing it on paper before coding prevents off-by-one errors. The recursive version is elegant but uses O(n) stack — prefer iterative in production.</p>`,
      },
      {
        title: "Floyd's cycle detection — slow & fast pointers",
        html: `<p>Floyd's Tortoise and Hare algorithm detects cycles in a linked list in O(n) time and O(1) space using two pointers moving at different speeds.</p>
<h2>Cycle detection</h2>
<pre><code>def has_cycle(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next        # move 1 step
        fast = fast.next.next   # move 2 steps
        if slow == fast:
            return True         # cycle detected
    return False</code></pre>
<p><strong>Why it works:</strong> If there's a cycle of length c, the fast pointer laps the slow pointer inside the cycle. They meet after at most c steps once both are in the cycle.</p>
<h2>Find the start of the cycle</h2>
<pre><code>def detect_cycle(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next; fast = fast.next.next
        if slow == fast: break
    else: return None   # no cycle

    # Reset slow to head, keep fast at meeting point
    slow = head
    while slow != fast:
        slow = slow.next; fast = fast.next
    return slow   # start of cycle</code></pre>
<p><strong>Mathematical proof:</strong> If the distance from head to cycle start is <em>a</em>, and they meet <em>b</em> steps into the cycle, then moving one pointer to the head and advancing both 1 step at a time makes them meet exactly at the cycle start after <em>a</em> more steps.</p>
<h2>Other applications</h2>
<ul>
<li><strong>Find duplicate in array</strong> (LC #287) — treat array as a linked list: index i → arr[i]</li>
<li><strong>Happy number</strong> — detect if digit-square sum cycle reaches 1</li>
<li><strong>Middle of linked list</strong> — when fast reaches end, slow is at middle</li>
</ul>
<h2>Key exam point</h2>
<p>The two-phase algorithm (detect → find start) is a common interview pattern. Memorise the "reset slow to head" step for finding the cycle start.</p>`,
      },
      {
        title: "Finding middle element, k-th from end",
        html: `<p>Two classic linked list problems solved elegantly with the two-pointer technique — no need to find the length first.</p>
<h2>Middle of linked list</h2>
<pre><code>def middle_node(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next        # 1 step
        fast = fast.next.next   # 2 steps
    return slow   # slow is at the middle when fast reaches end

# 1→2→3→4→5: slow stops at 3 (middle)
# 1→2→3→4:   slow stops at 3 (second middle for even length)</code></pre>
<p>For even-length lists, this returns the <strong>second</strong> of the two middle nodes. To get the first, stop when <code>fast.next.next</code> is null.</p>
<h2>K-th node from end (1-indexed)</h2>
<pre><code>def kth_from_end(head, k):
    fast = slow = head
    # Advance fast k steps ahead
    for _ in range(k):
        if not fast: return None   # k > list length
        fast = fast.next
    # Move both together until fast reaches end
    while fast:
        slow = slow.next; fast = fast.next
    return slow   # slow is k steps from end</code></pre>
<p><strong>Why it works:</strong> Fast is exactly k nodes ahead of slow. When fast falls off the end, slow is k from the end.</p>
<h2>Delete k-th node from end</h2>
<pre><code>def remove_nth_from_end(head, k):
    dummy = ListNode(0); dummy.next = head
    fast = slow = dummy
    for _ in range(k + 1): fast = fast.next
    while fast:
        slow = slow.next; fast = fast.next
    slow.next = slow.next.next   # skip the node
    return dummy.next</code></pre>
<h2>Key exam point</h2>
<p>Both problems use the same "gap pointer" idea. The dummy node in the deletion variant handles the edge case of deleting the head without a special condition.</p>`,
      },
      {
        title: "Merge two sorted linked lists",
        html: `<p>Merging two sorted linked lists produces a single sorted linked list in O(n+m) time and O(1) space — a building block for merge sort on linked lists.</p>
<h2>Iterative approach</h2>
<pre><code>def merge_sorted(l1, l2):
    dummy = ListNode(0); cur = dummy
    while l1 and l2:
        if l1.val &lt;= l2.val:
            cur.next = l1; l1 = l1.next
        else:
            cur.next = l2; l2 = l2.next
        cur = cur.next
    cur.next = l1 or l2   # attach remaining
    return dummy.next
# O(n+m) time, O(1) space</code></pre>
<h2>Recursive approach</h2>
<pre><code>def merge_recursive(l1, l2):
    if not l1: return l2
    if not l2: return l1
    if l1.val &lt;= l2.val:
        l1.next = merge_recursive(l1.next, l2); return l1
    else:
        l2.next = merge_recursive(l1, l2.next); return l2
# O(n+m) time, O(n+m) stack space</code></pre>
<h2>Merge k sorted lists — O(n log k)</h2>
<p>Use a min-heap of size k. At each step, extract the minimum node and push its successor.</p>
<pre><code>import heapq
def merge_k_lists(lists):
    dummy = ListNode(0); cur = dummy
    heap = [(node.val, i, node) for i, node in enumerate(lists) if node]
    heapq.heapify(heap)
    while heap:
        val, i, node = heapq.heappop(heap)
        cur.next = node; cur = cur.next
        if node.next: heapq.heappush(heap, (node.next.val, i, node.next))
    return dummy.next</code></pre>
<h2>Key exam point</h2>
<p>The dummy node eliminates the "is cur null?" check. Merge k sorted lists is an important extension — appears in database merge passes and external sort algorithms.</p>`,
      },
      {
        title: "Clone a list with random pointers",
        html: `<p>Each node has a <code>next</code> pointer and a <code>random</code> pointer that can point to any node or null. Clone the list in O(n) time.</p>
<h2>Approach 1 — Hash map (O(n) space)</h2>
<pre><code>def copy_random_list(head):
    if not head: return None
    old_to_new = {}
    # Pass 1: create all nodes
    cur = head
    while cur:
        old_to_new[cur] = Node(cur.val); cur = cur.next
    # Pass 2: assign next and random
    cur = head
    while cur:
        if cur.next:  old_to_new[cur].next   = old_to_new[cur.next]
        if cur.random: old_to_new[cur].random = old_to_new[cur.random]
        cur = cur.next
    return old_to_new[head]</code></pre>
<h2>Approach 2 — Interleaving (O(1) space)</h2>
<ol>
<li>Weave clones between originals: <code>1 → 1' → 2 → 2' → 3 → 3'</code></li>
<li>Set random pointers: <code>clone.random = original.random.next</code></li>
<li>Detach the two lists</li>
</ol>
<pre><code>def copy_random_list_o1(head):
    if not head: return None
    # Weave
    cur = head
    while cur:
        clone = Node(cur.val); clone.next = cur.next; cur.next = clone; cur = clone.next
    # Set randoms
    cur = head
    while cur:
        if cur.random: cur.next.random = cur.random.next
        cur = cur.next.next
    # Detach
    dummy = Node(0); clone_cur = dummy; cur = head
    while cur:
        clone_cur.next = cur.next; clone_cur = clone_cur.next; cur.next = clone_cur.next; cur = cur.next
    return dummy.next</code></pre>
<h2>Key exam point</h2>
<p>The hash map approach is cleaner and preferred in interviews. The O(1) space interleaving is a follow-up for top-tier companies — understand both approaches.</p>`,
      },
    ],
  },
  {
    chapterId: "ch-stacks-queues",
    subtopics: [
      {
        title: "Stack — LIFO principle, array & linked-list implementation",
        html: `<p>A <strong>stack</strong> is a Last-In, First-Out (LIFO) data structure. The last element pushed is the first one popped — like a stack of plates.</p>
<h2>Core operations — all O(1)</h2>
<table>
<thead><tr><th>Operation</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>push(x)</code></td><td>Add x to top</td></tr>
<tr><td><code>pop()</code></td><td>Remove and return top</td></tr>
<tr><td><code>peek() / top()</code></td><td>Return top without removing</td></tr>
<tr><td><code>is_empty()</code></td><td>True if stack has no elements</td></tr>
</tbody>
</table>
<h2>Array-based implementation</h2>
<pre><code>class ArrayStack:
    def __init__(self): self._data = []
    def push(self, x): self._data.append(x)   # O(1) amortised
    def pop(self): return self._data.pop()     # O(1)
    def peek(self): return self._data[-1]      # O(1)
    def is_empty(self): return not self._data</code></pre>
<h2>Linked-list implementation (unbounded, true O(1))</h2>
<pre><code>class Node:
    def __init__(self, val): self.val = val; self.next = None

class LinkedStack:
    def __init__(self): self.top = None; self.size = 0
    def push(self, x):
        node = Node(x); node.next = self.top; self.top = node; self.size += 1
    def pop(self):
        val = self.top.val; self.top = self.top.next; self.size -= 1; return val
    def peek(self): return self.top.val</code></pre>
<h2>Python built-in</h2>
<p>Python's <code>list</code> is the idiomatic stack: <code>append()</code> = push, <code>pop()</code> = pop, <code>[-1]</code> = peek. All O(1) amortised.</p>
<h2>Key exam point</h2>
<p>Always check for empty stack before <code>pop()</code> or <code>peek()</code> — "stack underflow" is a common bug. In interviews, using Python's list as a stack is fully acceptable.</p>`,
      },
      {
        title: "Stack applications — balanced brackets, function call stack, expression evaluation",
        html: `<p>Stacks appear naturally wherever you need to track nested or deferred operations — parsing, function calls, undo systems.</p>
<h2>1. Balanced brackets</h2>
<pre><code>def is_balanced(s):
    stack = []
    match = {')': '(', '}': '{', ']': '['}
    for ch in s:
        if ch in "({[": stack.append(ch)
        elif ch in ")}]":
            if not stack or stack[-1] != match[ch]: return False
            stack.pop()
    return not stack   # must be empty at end

# "([])" → True     "([)]" → False     "{" → False</code></pre>
<h2>2. Function call stack</h2>
<p>Every function call pushes a <strong>stack frame</strong> containing: local variables, return address, parameters. When the function returns, its frame is popped. Recursion too deep → <strong>stack overflow</strong>.</p>
<pre><code>def factorial(n):       # factorial(3) call stack:
    return 1 if n==0    # factorial(3) → factorial(2) → factorial(1) → factorial(0)
    else n * factorial(n-1)  # unwinds: 1 → 1 → 2 → 6</code></pre>
<h2>3. Evaluate postfix expression (Reverse Polish Notation)</h2>
<pre><code>def eval_rpn(tokens):
    stack = []
    ops = {'+': lambda a,b: a+b, '-': lambda a,b: a-b,
           '*': lambda a,b: a*b, '/': lambda a,b: int(a/b)}
    for t in tokens:
        if t in ops:
            b, a = stack.pop(), stack.pop()
            stack.append(ops[t](a, b))
        else:
            stack.append(int(t))
    return stack[0]

# ["2","1","+","3","*"] → (2+1)*3 = 9</code></pre>
<h2>4. Infix to postfix (Shunting-yard algorithm)</h2>
<p>Uses a stack for operators, outputs operands immediately. Higher-precedence operators are pushed; lower-precedence ones pop the stack first.</p>
<h2>Key exam point</h2>
<p>Balanced brackets is the canonical first stack question. Know it cold. Also understand that recursion implicitly uses the call stack — deep recursion can be converted to iteration with an explicit stack.</p>`,
      },
      {
        title: "Monotonic stack — next greater element, stock span, histogram max area",
        html: `<p>A <strong>monotonic stack</strong> maintains elements in strictly increasing or decreasing order. It processes each element in O(1) amortised — each element is pushed and popped at most once, giving O(n) total.</p>
<h2>Pattern: Next Greater Element</h2>
<pre><code>def next_greater(arr):
    n = len(arr); result = [-1] * n; stack = []   # stack holds indices
    for i in range(n):
        while stack and arr[i] > arr[stack[-1]]:
            idx = stack.pop()
            result[idx] = arr[i]   # arr[i] is the NGE for idx
        stack.append(i)
    return result

# arr = [4, 5, 2, 10, 8]
# NGE = [5, 10, 10, -1, -1]</code></pre>
<h2>Stock Span problem</h2>
<p>For each day, find how many consecutive previous days had stock price ≤ today's price.</p>
<pre><code>def stock_span(prices):
    stack = []; spans = []
    for i, p in enumerate(prices):
        while stack and prices[stack[-1]] &lt;= p: stack.pop()
        spans.append(i - stack[-1] if stack else i + 1)
        stack.append(i)
    return spans</code></pre>
<h2>Largest rectangle in histogram</h2>
<pre><code>def largest_rectangle(heights):
    stack = []; max_area = 0
    heights = heights + [0]   # sentinel to flush stack
    for i, h in enumerate(heights):
        while stack and heights[stack[-1]] > h:
            height = heights[stack.pop()]
            width = i if not stack else i - stack[-1] - 1
            max_area = max(max_area, height * width)
        stack.append(i)
    return max_area   # O(n) time</code></pre>
<h2>When to use monotonic stack</h2>
<ul>
<li>"Next greater / smaller element"</li>
<li>"Previous greater / smaller element"</li>
<li>Trapping rain water, largest rectangle, maximum width ramp</li>
</ul>
<h2>Key exam point</h2>
<p>The key insight: when you pop an element, it's because the current element is its "answer". The stack always represents elements that haven't found their answer yet.</p>`,
      },
      {
        title: "Queue — FIFO principle, circular queue, deque",
        html: `<p>A <strong>queue</strong> is a First-In, First-Out (FIFO) data structure — elements are enqueued at the rear and dequeued from the front, like a checkout line.</p>
<h2>Core operations — all O(1)</h2>
<table>
<thead><tr><th>Operation</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>enqueue(x)</code></td><td>Add x to rear</td></tr>
<tr><td><code>dequeue()</code></td><td>Remove and return front</td></tr>
<tr><td><code>front()</code></td><td>Peek at front without removing</td></tr>
<tr><td><code>is_empty()</code></td><td>True if no elements</td></tr>
</tbody>
</table>
<h2>Circular queue (array-based, fixed capacity)</h2>
<pre><code>class CircularQueue:
    def __init__(self, k):
        self.q = [0] * k; self.head = self.tail = self.size = 0; self.k = k
    def enqueue(self, x):
        if self.size == self.k: return False
        self.q[self.tail] = x; self.tail = (self.tail + 1) % self.k; self.size += 1; return True
    def dequeue(self):
        if not self.size: return False
        self.head = (self.head + 1) % self.k; self.size -= 1; return True
    def front(self): return self.q[self.head] if self.size else -1</code></pre>
<h2>Deque (double-ended queue)</h2>
<p>A deque allows O(1) insertions and deletions at <em>both</em> ends. Python's <code>collections.deque</code> is implemented as a doubly linked list.</p>
<pre><code>from collections import deque
dq = deque()
dq.appendleft(1)  # add to front
dq.append(2)      # add to rear
dq.popleft()      # remove from front — O(1)
dq.pop()          # remove from rear  — O(1)</code></pre>
<h2>Python queue options</h2>
<ul>
<li><code>collections.deque</code> — O(1) both ends, use as a queue with <code>append</code>/<code>popleft</code></li>
<li><code>queue.Queue</code> — thread-safe, for concurrent programs</li>
<li>Avoid <code>list</code> as a queue — <code>list.pop(0)</code> is O(n)</li>
</ul>
<h2>Key exam point</h2>
<p>BFS always uses a queue. Use <code>collections.deque</code> in Python — never <code>list.pop(0)</code> which is O(n) and will TLE on large inputs.</p>`,
      },
      {
        title: "Queue using two stacks; stack using two queues",
        html: `<p>These are classic structural transformation problems that test deep understanding of both data structures.</p>
<h2>Queue using two stacks</h2>
<p>Maintain two stacks: <code>inbox</code> (for enqueue) and <code>outbox</code> (for dequeue). When outbox is empty, pour inbox into it — reversing order to achieve FIFO.</p>
<pre><code>class MyQueue:
    def __init__(self):
        self.inbox = []; self.outbox = []
    def enqueue(self, x):
        self.inbox.append(x)   # O(1)
    def dequeue(self):
        self._transfer()
        return self.outbox.pop()  # O(1) amortised
    def peek(self):
        self._transfer()
        return self.outbox[-1]
    def _transfer(self):
        if not self.outbox:
            while self.inbox: self.outbox.append(self.inbox.pop())</code></pre>
<p><strong>Amortised analysis:</strong> Each element is pushed to inbox once, transferred once, popped from outbox once — O(1) amortised per operation.</p>
<h2>Stack using two queues</h2>
<p>Method: after each push, rotate elements so the new element is at the front of q1.</p>
<pre><code>from collections import deque
class MyStack:
    def __init__(self): self.q = deque()
    def push(self, x):
        self.q.append(x)
        for _ in range(len(self.q) - 1):   # rotate so x is at front
            self.q.append(self.q.popleft())
    def pop(self): return self.q.popleft()   # O(1)
    def top(self): return self.q[0]          # O(1)
# push is O(n), pop is O(1)</code></pre>
<h2>Alternative (lazy pop)</h2>
<p>For stack using queues: keep pushing normally, but on pop, transfer n-1 elements to q2, pop the last from q1, swap q1 and q2. Push is O(1), pop is O(n).</p>
<h2>Key exam point</h2>
<p>Queue-from-2-stacks (LC #232) is a classic. Know the amortised O(1) argument — dequeue is O(n) worst case but O(1) amortised because each element crosses between stacks at most once.</p>`,
      },
      {
        title: "Priority Queue — max-heap & min-heap using arrays",
        html: `<p>A <strong>priority queue</strong> always gives access to the highest (or lowest) priority element in O(1), and removes it in O(log n). It is typically implemented as a <strong>binary heap</strong>.</p>
<h2>Binary heap properties</h2>
<ul>
<li><strong>Shape property</strong>: a complete binary tree (all levels full except possibly the last, filled left to right)</li>
<li><strong>Heap property (max-heap)</strong>: parent ≥ both children at every node</li>
</ul>
<h2>Array representation</h2>
<pre><code># For node at index i (1-indexed):
parent(i) = i // 2
left(i)   = 2 * i
right(i)  = 2 * i + 1

# 0-indexed:
parent(i) = (i - 1) // 2
left(i)   = 2*i + 1
right(i)  = 2*i + 2</code></pre>
<h2>Insert — O(log n) — sift up</h2>
<pre><code>def insert(heap, x):
    heap.append(x); i = len(heap) - 1
    while i > 0:
        p = (i-1) // 2
        if heap[p] &lt; heap[i]: heap[p], heap[i] = heap[i], heap[p]; i = p
        else: break</code></pre>
<h2>Extract max — O(log n) — sift down</h2>
<pre><code>def extract_max(heap):
    heap[0], heap[-1] = heap[-1], heap[0]
    val = heap.pop()       # remove old max
    i = 0; n = len(heap)
    while True:
        l, r, largest = 2*i+1, 2*i+2, i
        if l &lt; n and heap[l] > heap[largest]: largest = l
        if r &lt; n and heap[r] > heap[largest]: largest = r
        if largest == i: break
        heap[i], heap[largest] = heap[largest], heap[i]; i = largest
    return val</code></pre>
<h2>Python heapq (min-heap by default)</h2>
<pre><code>import heapq
h = []; heapq.heappush(h, 3); heapq.heappush(h, 1); heapq.heappush(h, 2)
heapq.heappop(h)  # returns 1 (minimum)
# Max-heap: negate values  →  heapq.heappush(h, -x)</code></pre>
<h2>Heapify — O(n)</h2>
<p>Build a heap from an unsorted array in O(n) by sifting down from the last non-leaf. This is faster than n individual inserts (O(n log n)).</p>
<h2>Key exam point</h2>
<p>Python's <code>heapq</code> is a min-heap. For max-heap, negate values. <code>heapq.nlargest(k, arr)</code> and <code>heapq.nsmallest(k, arr)</code> are O(n log k) — useful for top-k problems.</p>`,
      },
      {
        title: "Applications — BFS, task scheduling, sliding-window maximum",
        html: `<p>Queues and priority queues are the backbone of a range of important algorithms.</p>
<h2>1. BFS (Breadth-First Search)</h2>
<pre><code>from collections import deque
def bfs(graph, start):
    visited = {start}; queue = deque([start])
    while queue:
        node = queue.popleft()
        print(node)
        for neighbour in graph[node]:
            if neighbour not in visited:
                visited.add(neighbour); queue.append(neighbour)
# Time: O(V + E)  Space: O(V)</code></pre>
<p>BFS finds the <strong>shortest path</strong> in an unweighted graph.</p>
<h2>2. Task Scheduling (CPU scheduling / LC #621)</h2>
<p>Given tasks with frequencies and a cooldown n, find minimum time. Use a max-heap on frequencies.</p>
<pre><code>import heapq
from collections import Counter
def least_interval(tasks, n):
    counts = list(Counter(tasks).values())
    heap = [-c for c in counts]; heapq.heapify(heap)
    time = 0
    while heap:
        cycle = []; i = 0
        while i &lt;= n and heap:
            cycle.append(-heapq.heappop(heap)); i += 1
        time += n + 1 if heap else i
        for c in cycle:
            if c - 1 > 0: heapq.heappush(heap, -(c-1))
    return time</code></pre>
<h2>3. Sliding Window Maximum (LC #239)</h2>
<p>Find the maximum in every window of size k — O(n) using a monotonic deque.</p>
<pre><code>from collections import deque
def max_sliding_window(nums, k):
    dq = deque(); result = []   # dq holds indices, decreasing values
    for i, x in enumerate(nums):
        while dq and dq[0] &lt; i - k + 1: dq.popleft()   # outside window
        while dq and nums[dq[-1]] &lt; x: dq.pop()         # smaller, useless
        dq.append(i)
        if i >= k - 1: result.append(nums[dq[0]])        # front = max
    return result</code></pre>
<h2>Key exam point</h2>
<p>Sliding window maximum using a deque is a hard but common interview question. The deque maintains a decreasing sequence of values — whenever a new larger element arrives, smaller ones can never be the window maximum again.</p>`,
      },
    ],
  },
];

async function writeSubtopicContent(courseSlug: string, chapterId: string, subtopicTitle: string, html: string) {
  const ref = db.collection("courses").doc(courseSlug).collection("chapters").doc(chapterId);
  const snap = await ref.get();
  if (!snap.exists) { console.log(`  SKIP ${chapterId} — not found`); return false; }
  const subtopics = (snap.data()!.subtopics || []).map((s: any) =>
    s.title === subtopicTitle ? { ...s, contentHtml: html } : s
  );
  const matched = subtopics.some((s: any) => s.title === subtopicTitle && s.contentHtml === html);
  if (!matched) { console.log(`  WARN: "${subtopicTitle}" not found`); return false; }
  await ref.update({ subtopics, updatedAt: Timestamp.now() });
  return true;
}

(async () => {
  console.log("[dsa-content ch3-ch4] writing to prod...");
  let total = 0;
  for (const ch of CONTENT) {
    console.log(`\n${ch.chapterId}:`);
    for (const sub of ch.subtopics) {
      const ok = await writeSubtopicContent("data-structures-algorithms", ch.chapterId, sub.title, sub.html);
      if (ok) { total++; console.log(`  ✓ ${sub.title}`); }
    }
  }
  console.log(`\nDone — ${total} subtopics updated.`);
  process.exit(0);
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
