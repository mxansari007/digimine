/**
 * Deploy course structures to Firestore.
 * Run from repo root:
 *   FIRESTORE_EMULATOR_HOST= FIREBASE_AUTH_EMULATOR_HOST= \
 *   FIREBASE_STORAGE_EMULATOR_HOST= NEXT_PUBLIC_USE_FIREBASE_EMULATORS= \
 *   pnpm tsx scripts/deploy-courses.ts
 * Set PR_SLUGS=slug1,slug2 to deploy only specific courses.
 */
import { config } from "dotenv";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
config({ path: "/Users/maazansari/digimine/apps/web/.env.local" });
const pid = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "digimine-1c33f";
if (!getApps().length) initializeApp({ credential: cert({ projectId: pid, clientEmail: process.env.FIREBASE_CLIENT_EMAIL!, privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n") }) });
const db = getFirestore();

const now = () => Timestamp.now();

const COURSES: Array<{
  slug: string; title: string; description: string; category: string;
  difficulty: "beginner"|"intermediate"|"advanced"; estimatedHours: number;
  tags: string[]; accessType: "free"|"premium"; price: number;
  linkedQuizzes: string[]; linkedTestSeriesIds: string[];
  notesOutline: Array<{ moduleTitle: string; lessonTitles: string[] }>;
}> = [
  {
    slug: "operating-systems",
    title: "Operating Systems — Complete Placement Guide",
    description: "Master OS concepts that appear in TCS NQT, Infosys, Wipro, Cognizant & GATE: processes & threads, CPU scheduling, memory management, virtual memory, file systems, I/O, deadlock, and synchronisation. Every topic covered with definitions, examples, and comparison tables.",
    category: "Computer Science",
    difficulty: "intermediate",
    estimatedHours: 18,
    tags: ["os","operating-systems","placement","gate","interview"],
    accessType: "free", price: 0,
    linkedQuizzes: ["operating-systems"],
    linkedTestSeriesIds: [],
    notesOutline: [
      { moduleTitle: "Introduction to Operating Systems", lessonTitles: [
        "What is an OS? Goals & functions",
        "Types of OS — Batch, Time-Sharing, Real-Time, Distributed, Embedded",
        "System calls & OS services",
        "Kernel vs User mode — privilege levels",
        "Monolithic, Microkernel, Hybrid architectures",
      ]},
      { moduleTitle: "Processes & Threads", lessonTitles: [
        "Process concept — PCB, process states (New → Ready → Running → Waiting → Terminated)",
        "Process creation: fork(), exec(), wait()",
        "Context switching — mechanism & overhead",
        "Threads — user-level vs kernel-level threads",
        "Multithreading models: Many-to-One, One-to-One, Many-to-Many",
        "Benefits of threads vs processes",
        "Inter-Process Communication: pipes, message queues, shared memory, sockets",
      ]},
      { moduleTitle: "CPU Scheduling", lessonTitles: [
        "Scheduling criteria — CPU utilisation, throughput, turnaround, waiting, response time",
        "FCFS — First Come First Served (non-preemptive)",
        "SJF — Shortest Job First (non-preemptive & preemptive/SRTF)",
        "Round Robin — time quantum selection, trade-offs",
        "Priority Scheduling — preemptive & non-preemptive; starvation & ageing",
        "Multilevel Queue & Multilevel Feedback Queue",
        "Scheduling algorithm comparison table + numerical problems",
      ]},
      { moduleTitle: "Process Synchronisation", lessonTitles: [
        "Race conditions & the Critical Section Problem",
        "Peterson's Solution",
        "Hardware-level synchronisation — test-and-set, compare-and-swap",
        "Mutex locks",
        "Semaphores — counting & binary; wait() and signal()",
        "Classic problems: Producer-Consumer, Readers-Writers, Dining Philosophers",
        "Monitors & condition variables",
      ]},
      { moduleTitle: "Deadlock", lessonTitles: [
        "Necessary conditions: Mutual Exclusion, Hold-and-Wait, No Preemption, Circular Wait",
        "Resource Allocation Graphs — cycle detection",
        "Deadlock Prevention — attacking each necessary condition",
        "Deadlock Avoidance — Banker's Algorithm (safe-state detection)",
        "Deadlock Detection & Recovery",
        "Combined approach & practical considerations",
      ]},
      { moduleTitle: "Memory Management", lessonTitles: [
        "Logical vs Physical address space; address binding",
        "Contiguous allocation — fixed & variable partitions; fragmentation",
        "Compaction, Paging — page table, page size trade-offs",
        "Segmentation — segment table, segmentation vs paging",
        "Paged Segmentation",
        "TLB — Translation Lookaside Buffer; effective access time",
      ]},
      { moduleTitle: "Virtual Memory", lessonTitles: [
        "Demand paging — page fault handling",
        "Page Replacement Algorithms: FIFO, Optimal, LRU, LRU Approximations (clock/second-chance)",
        "Belady's anomaly",
        "Thrashing — working-set model, page-fault frequency",
        "Copy-on-Write (COW)",
        "Memory-mapped files",
      ]},
      { moduleTitle: "File Systems & I/O", lessonTitles: [
        "File concept — attributes, operations, types",
        "Directory structures — single-level, two-level, tree, acyclic & general graph",
        "Allocation methods — contiguous, linked, indexed (i-node)",
        "Free-space management — bit vector, linked list, grouping",
        "Disk scheduling: FCFS, SSTF, SCAN, C-SCAN, LOOK, C-LOOK",
        "I/O hardware — polling, interrupts, DMA",
        "Kernel I/O subsystem — buffering, caching, spooling",
      ]},
    ],
  },

  {
    slug: "computer-networks",
    title: "Computer Networks — Complete Placement Guide",
    description: "Full CN course for placement preparation: OSI & TCP/IP models, all major protocols, IP addressing & subnetting, routing, transport layer (TCP/UDP), DNS, HTTP, security basics, and socket fundamentals. Conceptual clarity with exam-style questions built in.",
    category: "Computer Science",
    difficulty: "intermediate",
    estimatedHours: 16,
    tags: ["cn","computer-networks","networking","placement","gate","interview"],
    accessType: "free", price: 0,
    linkedQuizzes: ["computer-networks"],
    linkedTestSeriesIds: [],
    notesOutline: [
      { moduleTitle: "Introduction & Network Models", lessonTitles: [
        "What is a computer network? Goals, types (LAN/MAN/WAN/PAN)",
        "Network topologies — bus, star, ring, mesh, hybrid",
        "OSI Model — 7 layers, each layer's role & PDU name",
        "TCP/IP Model — 4 layers vs OSI mapping",
        "Comparison: OSI vs TCP/IP with exam-style points",
        "Transmission modes — simplex, half-duplex, full-duplex",
      ]},
      { moduleTitle: "Physical & Data Link Layer", lessonTitles: [
        "Bandwidth, throughput, latency — definitions & units",
        "Guided media: twisted pair (UTP/STP), coaxial, fibre optic",
        "Unguided media: radio, microwave, infrared",
        "Framing — character count, flag bytes, bit stuffing",
        "Error detection: parity, CRC, Hamming code",
        "Error correction — ARQ protocols: Stop-and-Wait, Go-Back-N, Selective Repeat",
        "Sliding window protocols — efficiency calculations",
        "CSMA/CD (Ethernet) & CSMA/CA (Wi-Fi) — collision handling",
        "Switches vs Hubs vs Bridges — layer-2 forwarding, MAC table",
        "VLANs basics",
      ]},
      { moduleTitle: "Network Layer", lessonTitles: [
        "IP addressing — IPv4 structure, classes (A/B/C/D/E)",
        "Subnetting & CIDR — subnet mask, /notation, host range, broadcast",
        "Subnetting numerical practice (5 worked examples)",
        "IPv6 — address format, types, advantages over IPv4",
        "ARP & RARP — address resolution",
        "ICMP — ping, traceroute, error messages",
        "Routing concepts — static vs dynamic",
        "Distance Vector Routing — Bellman-Ford, RIP, count-to-infinity problem",
        "Link State Routing — Dijkstra, OSPF basics",
        "BGP basics — inter-AS routing",
        "NAT & PAT — private addressing, port translation",
      ]},
      { moduleTitle: "Transport Layer", lessonTitles: [
        "Port numbers — well-known (0–1023), registered, dynamic",
        "UDP — datagram structure, use cases (DNS, DHCP, streaming)",
        "TCP — segment structure, connection establishment (3-way handshake)",
        "TCP — connection termination (4-way FIN)",
        "TCP — flow control (receiver window) & congestion control (slow start, congestion avoidance, fast retransmit/recovery)",
        "TCP — reliable delivery, sequence numbers, ACKs, retransmission",
        "TCP vs UDP comparison table",
        "Socket programming — client-server model (conceptual)",
      ]},
      { moduleTitle: "Application Layer Protocols", lessonTitles: [
        "DNS — hierarchy, resolution process (recursive vs iterative), record types (A, AAAA, MX, CNAME, NS)",
        "DHCP — DORA process (Discover, Offer, Request, Acknowledge)",
        "HTTP & HTTPS — request/response structure, methods, status codes, HTTP/1.1 vs HTTP/2",
        "FTP — active vs passive mode, control & data connections",
        "SMTP, POP3 & IMAP — email flow",
        "SSH & Telnet — remote access",
        "SNMP — network management basics",
      ]},
      { moduleTitle: "Network Security Fundamentals", lessonTitles: [
        "Symmetric vs Asymmetric encryption — DES, AES, RSA",
        "Hashing — MD5, SHA, digital signatures, MAC",
        "SSL/TLS — handshake, certificates, CA",
        "Firewalls — packet filtering, stateful inspection, proxy",
        "VPN — tunnelling, IPSec",
        "Common attacks — DoS, DDoS, man-in-the-middle, phishing, SQL injection (network context)",
      ]},
    ],
  },

  {
    slug: "dbms-fundamentals",
    title: "DBMS & SQL — Complete Placement Guide",
    description: "Covers every DBMS topic asked in campus placements and GATE: relational model, SQL (DDL/DML/DCL/TCL), ER modelling, normalisation (1NF–BCNF), transactions & ACID, concurrency control, indexing, and query optimisation. Includes SQL query tracing exercises.",
    category: "Computer Science",
    difficulty: "intermediate",
    estimatedHours: 14,
    tags: ["dbms","sql","database","placement","gate","interview"],
    accessType: "free", price: 0,
    linkedQuizzes: ["dbms-sql"],
    linkedTestSeriesIds: [],
    notesOutline: [
      { moduleTitle: "Introduction to DBMS", lessonTitles: [
        "Database vs File System — advantages of DBMS",
        "DBMS architecture — 3-tier (Physical, Logical, View)",
        "Data independence — physical & logical",
        "Data models — hierarchical, network, relational, object-oriented",
        "Database users & DBA roles",
        "Database languages — DDL, DML, DCL, TCL",
      ]},
      { moduleTitle: "Entity-Relationship (ER) Model", lessonTitles: [
        "Entities, attributes, entity sets — simple, composite, multivalued, derived",
        "Relationships & relationship sets — degree, cardinality (1:1, 1:N, M:N)",
        "Participation constraints — total vs partial",
        "Weak entities & identifying relationships",
        "Extended ER — specialisation, generalisation, aggregation",
        "ER-to-Relational mapping (step-by-step conversion)",
      ]},
      { moduleTitle: "Relational Model & Relational Algebra", lessonTitles: [
        "Relation, tuple, attribute, domain — formal definitions",
        "Keys — super key, candidate key, primary key, foreign key, composite key",
        "Integrity constraints — domain, key, referential",
        "Relational Algebra — Select (σ), Project (π), Cartesian Product (×)",
        "Relational Algebra — Join types: θ-join, equi-join, natural join",
        "Set operations — Union, Intersection, Difference",
        "Division operator",
        "Relational Calculus (Tuple RC & Domain RC) — overview",
      ]},
      { moduleTitle: "SQL — Core Language", lessonTitles: [
        "DDL: CREATE, ALTER, DROP, TRUNCATE, RENAME",
        "DML: SELECT, INSERT, UPDATE, DELETE",
        "WHERE, AND/OR/NOT, BETWEEN, IN, LIKE, IS NULL",
        "ORDER BY, DISTINCT, LIMIT/OFFSET",
        "Aggregate functions: COUNT, SUM, AVG, MIN, MAX",
        "GROUP BY & HAVING — difference from WHERE",
        "Joins: INNER, LEFT, RIGHT, FULL OUTER, CROSS, SELF JOIN",
        "Subqueries — correlated vs non-correlated, IN/EXISTS/ANY/ALL",
        "Set operators: UNION, UNION ALL, INTERSECT, EXCEPT/MINUS",
        "Views — CREATE VIEW, advantages, updatable views",
      ]},
      { moduleTitle: "Normalisation", lessonTitles: [
        "Functional Dependencies — Armstrong's Axioms",
        "Closure of attributes & of FD sets",
        "Canonical Cover / Minimal Cover",
        "1NF — eliminate repeating groups & multivalued attributes",
        "2NF — eliminate partial dependencies",
        "3NF — eliminate transitive dependencies; 3NF synthesis algorithm",
        "BCNF — Boyce-Codd Normal Form; BCNF decomposition",
        "4NF & 5NF — multivalued & join dependencies (overview)",
        "Lossless join & dependency-preserving decomposition",
        "Normalisation worked examples (5 step-by-step)",
      ]},
      { moduleTitle: "Transactions & Concurrency Control", lessonTitles: [
        "Transaction concept — ACID properties (Atomicity, Consistency, Isolation, Durability)",
        "Transaction states — Active, Partially committed, Committed, Failed, Aborted",
        "Serializability — conflict serializability, view serializability",
        "Precedence (serializability) graphs",
        "Lock-based protocols — Shared/Exclusive locks, 2-Phase Locking (2PL)",
        "Deadlock in DBMS — detection, prevention, timeout, wound-wait & wait-die",
        "Timestamp-based protocols",
        "Multi-version Concurrency Control (MVCC) — overview",
        "Recovery — log-based (undo/redo), checkpoints, shadow paging",
      ]},
      { moduleTitle: "Indexing & Query Processing", lessonTitles: [
        "File organisation — heap, sequential, hash",
        "Single-level indices — primary, secondary, clustering",
        "B-Tree & B+-Tree — structure, insertion, deletion",
        "Hash indexing — static vs dynamic, extendible hashing",
        "Query processing steps — parsing, optimisation, execution",
        "Query optimisation — equivalence rules, cost estimation",
        "Relational algebra expression trees & heuristic optimisation",
      ]},
    ],
  },

  {
    slug: "system-design-fundamentals",
    title: "System Design — Interview & Placement Guide",
    description: "Structured system-design preparation from fundamentals to real interview problems: scalability principles, databases, caching, messaging queues, load balancing, microservices, and worked designs for URL shortener, WhatsApp, YouTube, Twitter, and booking systems.",
    category: "System Design",
    difficulty: "advanced",
    estimatedHours: 20,
    tags: ["system-design","scalability","distributed-systems","interview","backend"],
    accessType: "free", price: 0,
    linkedQuizzes: [],
    linkedTestSeriesIds: [],
    notesOutline: [
      { moduleTitle: "Foundations of System Design", lessonTitles: [
        "What is system design? Functional vs Non-Functional requirements",
        "Capacity estimation — users, QPS, storage, bandwidth (back-of-envelope)",
        "Horizontal vs Vertical scaling",
        "Latency vs Throughput — SLA, SLO, SLI",
        "Availability & reliability — 99.9% vs 99.99% uptime; MTTR, MTBF",
        "CAP Theorem — Consistency, Availability, Partition Tolerance; trade-offs",
        "PACELC extension",
      ]},
      { moduleTitle: "Load Balancing & Proxies", lessonTitles: [
        "Why load balancing? Single point of failure",
        "Algorithms — Round Robin, Weighted Round Robin, Least Connections, IP Hash",
        "Layer 4 vs Layer 7 load balancers",
        "Health checks & failover",
        "Reverse proxy vs forward proxy",
        "API Gateway — rate limiting, auth, routing",
      ]},
      { moduleTitle: "Databases — SQL vs NoSQL", lessonTitles: [
        "RDBMS recap — ACID, when to choose relational",
        "NoSQL types — Key-Value, Document, Columnar, Graph — use cases",
        "Sharding — horizontal partitioning, shard keys, consistent hashing",
        "Replication — master-slave, master-master, read replicas",
        "Database partitioning strategies",
        "When to use SQL vs NoSQL — decision framework",
        "NewSQL & globally distributed databases (Spanner/CockroachDB overview)",
      ]},
      { moduleTitle: "Caching", lessonTitles: [
        "Why caching? Cache hit/miss, cache ratio",
        "Cache aside, Read-Through, Write-Through, Write-Back, Write-Around",
        "Eviction policies — LRU, LFU, MRU, FIFO",
        "Redis vs Memcached — comparison",
        "CDN — edge caching, static & dynamic content",
        "Cache invalidation strategies & consistency problems",
      ]},
      { moduleTitle: "Messaging Queues & Event Streaming", lessonTitles: [
        "Synchronous vs Asynchronous communication",
        "Message queues — producer-consumer model",
        "RabbitMQ — exchanges, queues, routing keys, acknowledgements",
        "Apache Kafka — topics, partitions, consumer groups, offsets, retention",
        "Kafka vs RabbitMQ — when to use which",
        "Event-driven architecture & eventual consistency",
        "Outbox pattern for reliable messaging",
      ]},
      { moduleTitle: "Microservices & Distributed Patterns", lessonTitles: [
        "Monolith vs SOA vs Microservices — pros/cons",
        "Service decomposition strategies — by business capability, by subdomain",
        "Inter-service communication — REST vs gRPC vs message queues",
        "Service discovery — client-side (Eureka) vs server-side",
        "Circuit Breaker pattern — closed, open, half-open states",
        "Saga pattern — choreography vs orchestration",
        "Idempotency, at-least-once & exactly-once delivery",
        "Distributed tracing & observability (Zipkin / Jaeger / OpenTelemetry)",
      ]},
      { moduleTitle: "Storage, File Systems & CDN", lessonTitles: [
        "Object storage — S3 model, buckets, presigned URLs",
        "Block storage vs Object storage vs File storage",
        "Blob storage for images/videos",
        "Video streaming — HLS/DASH, adaptive bitrate, chunked upload",
        "Content Delivery Networks — PoP locations, cache-control headers",
        "Data replication across regions — RPO & RTO",
      ]},
      { moduleTitle: "Designing Real Systems — Case Studies", lessonTitles: [
        "URL Shortener (bit.ly) — hashing, redirection, analytics",
        "WhatsApp / Chat System — WebSocket, message delivery receipts, presence",
        "YouTube / Video Platform — upload pipeline, encoding, HLS streaming, recommendations",
        "Twitter / News Feed — fan-out on write vs read, timeline generation",
        "Hotel / Cab Booking System — availability, locking, overbooking prevention",
        "Rate Limiter — token bucket, leaky bucket, sliding window counter",
        "Distributed ID Generator — UUID, Twitter Snowflake, database auto-increment limitations",
        "Search Autocomplete — trie, prefix cache, personalisation",
      ]},
    ],
  },
  // ─── DSA ─────────────────────────────────────────────────────────
  {
    slug: "data-structures-algorithms",
    title: "Data Structures & Algorithms — Complete Placement Guide",
    description: "End-to-end DSA course for placement prep: arrays, linked lists, stacks, queues, trees, heaps, graphs, hashing, sorting, searching, dynamic programming, and greedy algorithms. Every concept paired with complexity analysis and company-pattern problem walkthroughs.",
    category: "Programming",
    difficulty: "intermediate",
    estimatedHours: 30,
    tags: ["dsa","data-structures","algorithms","placement","gate","interview","coding"],
    accessType: "free", price: 0,
    linkedQuizzes: ["data-structures","programming-logic"],
    linkedTestSeriesIds: ["tcs-nqt-2026-mock-test-series"],
    notesOutline: [
      { moduleTitle: "Foundations & Complexity Analysis", lessonTitles: [
        "Why DSA? Solving problems efficiently",
        "Time complexity — Big-O, Big-Ω, Big-Θ notation",
        "Space complexity — auxiliary vs total space",
        "Best, average, worst case analysis",
        "Amortised analysis — dynamic array example",
        "Recurrence relations — substitution, recursion tree, Master Theorem",
      ]},
      { moduleTitle: "Arrays & Strings", lessonTitles: [
        "Array internals — memory layout, cache friendliness",
        "Two-pointer technique — pair sum, triplet sum, remove duplicates",
        "Sliding window — fixed & variable size (max subarray sum, longest substring)",
        "Prefix sums & difference arrays",
        "Kadane's Algorithm — maximum subarray",
        "Binary search on arrays — lower_bound, upper_bound, rotated arrays",
        "String fundamentals — immutability, character arrays",
        "String pattern matching — naive, KMP algorithm",
        "Anagram, palindrome & frequency-map problems",
      ]},
      { moduleTitle: "Linked Lists", lessonTitles: [
        "Singly linked list — node structure, insertion, deletion, traversal",
        "Doubly linked list — prev/next pointers, operations",
        "Circular linked list",
        "Reverse a linked list — iterative & recursive",
        "Floyd's cycle detection — slow & fast pointers",
        "Finding middle element, k-th from end",
        "Merge two sorted linked lists",
        "Clone a list with random pointers",
      ]},
      { moduleTitle: "Stacks & Queues", lessonTitles: [
        "Stack — LIFO principle, array & linked-list implementation",
        "Stack applications — balanced brackets, function call stack, expression evaluation",
        "Monotonic stack — next greater element, stock span, histogram max area",
        "Queue — FIFO principle, circular queue, deque",
        "Queue using two stacks; stack using two queues",
        "Priority Queue — max-heap & min-heap using arrays",
        "Applications — BFS, task scheduling, sliding-window maximum",
      ]},
      { moduleTitle: "Trees", lessonTitles: [
        "Binary tree — terminology, traversals (inorder, preorder, postorder, level-order)",
        "Binary Search Tree (BST) — insert, delete, search, floor, ceil",
        "BST validation, kth smallest/largest",
        "Balanced BSTs — AVL tree (rotations overview), Red-Black tree (concept)",
        "Heap — max-heap & min-heap, heapify, heap sort",
        "Heap applications — k largest elements, median of stream",
        "Tries — insert, search, prefix counting, auto-complete",
        "Segment tree — range sum, range min, lazy propagation (overview)",
        "Fenwick / Binary Indexed Tree — prefix sums",
      ]},
      { moduleTitle: "Hashing", lessonTitles: [
        "Hash functions — division, multiplication, universal hashing",
        "Collision resolution — chaining vs open addressing (linear, quadratic, double hashing)",
        "Load factor & rehashing",
        "HashMap internals (Java HashMap / Python dict)",
        "Classic problems — two-sum, group anagrams, longest consecutive sequence",
        "Rolling hash — Rabin-Karp algorithm",
      ]},
      { moduleTitle: "Graphs", lessonTitles: [
        "Graph representations — adjacency matrix vs adjacency list",
        "Graph traversals — BFS (shortest path in unweighted graph), DFS",
        "Cycle detection — undirected (union-find / DFS), directed (DFS colour)",
        "Topological sort — Kahn's algorithm (BFS) & DFS-based",
        "Shortest paths — Dijkstra's algorithm (non-negative weights)",
        "Shortest paths — Bellman-Ford (negative edges), Floyd-Warshall (all-pairs)",
        "Minimum Spanning Tree — Prim's & Kruskal's algorithms",
        "Union-Find / Disjoint Set Union — path compression & union by rank",
        "Strongly Connected Components — Kosaraju's & Tarjan's algorithms",
        "Bipartite check, bridges & articulation points",
      ]},
      { moduleTitle: "Sorting & Searching", lessonTitles: [
        "Comparison sorts — Bubble, Selection, Insertion (O(n²) analysis)",
        "Merge Sort — divide & conquer, stable, O(n log n)",
        "Quick Sort — partition (Lomuto/Hoare), pivot selection, worst case",
        "Heap Sort — in-place O(n log n)",
        "Non-comparison sorts — Counting, Radix, Bucket sort",
        "Sorting algorithm comparison table (stable, in-place, complexity)",
        "Binary search variants — search in sorted rotated array, peak element, square root",
        "Ternary search & search on answer (minimise maximum concept)",
      ]},
      { moduleTitle: "Dynamic Programming", lessonTitles: [
        "DP fundamentals — overlapping subproblems, optimal substructure",
        "Memoization (top-down) vs Tabulation (bottom-up)",
        "Classic 1-D DP — Fibonacci, climbing stairs, house robber, coin change",
        "Classic 2-D DP — unique paths, minimum path sum, edit distance",
        "Longest Common Subsequence (LCS) & Longest Common Substring",
        "Longest Increasing Subsequence (LIS) — O(n²) & O(n log n)",
        "0/1 Knapsack & Unbounded Knapsack",
        "Subset sum, partition equal subset",
        "Matrix Chain Multiplication — interval DP",
        "DP on trees & DP on graphs (overview)",
      ]},
      { moduleTitle: "Greedy & Backtracking", lessonTitles: [
        "Greedy strategy — when it works & when it doesn't",
        "Activity selection, job sequencing with deadlines",
        "Huffman encoding",
        "Fractional knapsack",
        "Backtracking fundamentals — decision tree pruning",
        "N-Queens, Sudoku solver, rat in a maze",
        "Permutations & combinations via backtracking",
        "Word search, generate all subsets/powerset",
      ]},
    ],
  },

  // ─── OOPS ─────────────────────────────────────────────────────────
  {
    slug: "oops-concepts",
    title: "Object-Oriented Programming — Complete Placement Guide",
    description: "Master every OOPS concept asked in TCS, Infosys, Wipro, Cognizant & Accenture interviews: classes & objects, the four pillars (encapsulation, inheritance, polymorphism, abstraction), C++ and Java specifics, design patterns, and SOLID principles — with code examples and MCQ patterns.",
    category: "Programming",
    difficulty: "beginner",
    estimatedHours: 12,
    tags: ["oops","java","cpp","c++","object-oriented","placement","interview"],
    accessType: "free", price: 0,
    linkedQuizzes: ["oops","c-programming"],
    linkedTestSeriesIds: [],
    notesOutline: [
      { moduleTitle: "Introduction to OOPS", lessonTitles: [
        "Procedural vs Object-Oriented programming",
        "Class & Object — definition, instantiation",
        "Data members & member functions",
        "Access specifiers — public, private, protected",
        "this pointer / self reference",
        "static members — shared across instances",
      ]},
      { moduleTitle: "Encapsulation & Abstraction", lessonTitles: [
        "Encapsulation — bundling data + behaviour, data hiding",
        "Getters & Setters — controlled access",
        "Abstraction — hiding implementation details",
        "Abstract classes — pure virtual functions (C++) / abstract methods (Java)",
        "Interfaces in Java — default methods, multiple interface implementation",
        "Encapsulation vs Abstraction — key differences",
      ]},
      { moduleTitle: "Inheritance", lessonTitles: [
        "Base class & derived class — IS-A relationship",
        "Types of inheritance: single, multilevel, hierarchical, multiple (C++), hybrid",
        "Method overriding — runtime polymorphism setup",
        "super / parent class constructor calls",
        "protected access in inheritance",
        "Multiple inheritance in C++ — diamond problem & virtual base class",
        "Java — why no multiple class inheritance; interface workaround",
        "Inheritance vs Composition — when to prefer which (HAS-A vs IS-A)",
      ]},
      { moduleTitle: "Polymorphism", lessonTitles: [
        "Compile-time (static) polymorphism — function overloading",
        "Operator overloading (C++) — rules, restrictions",
        "Runtime (dynamic) polymorphism — method overriding + virtual functions",
        "Virtual functions & vtable (C++) — mechanism under the hood",
        "Pure virtual functions & abstract classes",
        "virtual destructor — why it's essential",
        "Overloading vs Overriding comparison table",
        "Dynamic dispatch — how the correct method is selected at runtime",
      ]},
      { moduleTitle: "Constructors, Destructors & Memory", lessonTitles: [
        "Default, parameterised & copy constructors",
        "Constructor initialisation list (C++)",
        "Destructor — when called, virtual destructor rule",
        "Shallow copy vs deep copy — copy constructor importance",
        "new & delete (C++) / garbage collection (Java)",
        "Rule of three (C++) — destructor, copy constructor, copy assignment",
        "Rule of five (C++) — move constructor & move assignment (overview)",
        "Stack vs Heap allocation",
      ]},
      { moduleTitle: "C++ Specifics", lessonTitles: [
        "References vs pointers",
        "const correctness — const member functions, const objects",
        "Friend functions & friend classes",
        "Templates — function templates, class templates",
        "STL overview — vector, list, map, set, queue, stack, priority_queue, unordered_map",
        "Namespaces",
        "Exception handling — try/catch/throw, exception hierarchy",
      ]},
      { moduleTitle: "Java Specifics", lessonTitles: [
        "Java memory model — heap, stack, method area",
        "Object class — equals(), hashCode(), toString(), clone()",
        "String immutability — String vs StringBuilder vs StringBuffer",
        "Collections framework — List, Set, Map, Queue hierarchies",
        "Generics — type parameters, bounded wildcards",
        "Exception hierarchy — checked vs unchecked; try-with-resources",
        "Java 8 features — lambda expressions, functional interfaces, streams, Optional",
      ]},
      { moduleTitle: "SOLID Principles & Design Patterns", lessonTitles: [
        "SOLID — Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion",
        "Creational patterns — Singleton, Factory Method, Abstract Factory, Builder",
        "Structural patterns — Adapter, Decorator, Facade, Proxy",
        "Behavioural patterns — Observer, Strategy, Command, Iterator, Template Method",
        "Design pattern recognition in placement MCQs",
      ]},
    ],
  },

  // ─── Aptitude ─────────────────────────────────────────────────────
  {
    slug: "aptitude-placement-prep",
    title: "Quantitative Aptitude & Reasoning — Complete Placement Guide",
    description: "Full aptitude preparation for TCS NQT, Infosys, Wipro, Cognizant, Capgemini & Accenture: arithmetic (quant), logical reasoning, verbal ability, data interpretation, and programming logic — with formulas, shortcut tricks, worked examples, and exam-style practice for every topic.",
    category: "Aptitude",
    difficulty: "beginner",
    estimatedHours: 22,
    tags: ["aptitude","quant","reasoning","verbal","placement","tcs","infosys","wipro"],
    accessType: "free", price: 0,
    linkedQuizzes: [
      "quant-arithmetic","quant-number-algebra","quant-time-speed-work",
      "quant-permutation-probability","reasoning-verbal","reasoning-puzzles",
      "data-interpretation","verbal-ability","programming-logic",
    ],
    linkedTestSeriesIds: ["tcs-nqt-2026-mock-test-series"],
    notesOutline: [
      { moduleTitle: "Number System & Divisibility", lessonTitles: [
        "Natural, whole, integers, rational, irrational, real numbers",
        "Divisibility rules (2 to 13) with examples",
        "HCF & LCM — prime factorisation and division methods",
        "HCF & LCM word problems (bells, ropes, tiles)",
        "Remainder theorem, Fermat's little theorem (basic)",
        "Cyclicity of last digits (unit digit problems)",
        "Surds, indices & logarithms — laws and simplification",
        "BODMAS / PEMDAS — order of operations with tricky examples",
      ]},
      { moduleTitle: "Percentages, Profit & Loss", lessonTitles: [
        "Percentage basics — conversion, percentage change",
        "Successive percentage changes — net change formula",
        "Profit & Loss — CP, SP, MP, discount, gain/loss %",
        "Marked price & discount — single & successive discounts",
        "Equivalent single discount formula",
        "Dishonest dealing — false weights, adulteration",
        "Shortcut tricks for common exam scenarios",
      ]},
      { moduleTitle: "Ratio, Proportion & Averages", lessonTitles: [
        "Ratio & proportion — basics, properties",
        "Compound ratios & proportional division",
        "Variation — direct, inverse, joint",
        "Average — definition, weighted average",
        "Average speed — harmonic mean for equal distances",
        "Mixtures & Alligation — weighted average method, rule of alligation",
        "Partnership — profit sharing, time-weighted capital",
      ]},
      { moduleTitle: "Time, Speed & Distance / Work", lessonTitles: [
        "TSD basics — relative speed (same & opposite direction)",
        "Trains — crossing problems (platform, bridge, man)",
        "Boats & Streams — upstream/downstream speed",
        "Circular track problems",
        "Time & Work — individual & combined efficiency",
        "Pipes & Cisterns — filling + leakage",
        "Work & wages, MDH (man-day-hour) problems",
      ]},
      { moduleTitle: "Simple & Compound Interest, Mensuration", lessonTitles: [
        "Simple Interest — formula, finding P/R/T",
        "Compound Interest — annual, half-yearly, quarterly compounding",
        "CI vs SI difference formula",
        "Effective rate of interest",
        "Areas — triangle (all formulas), quadrilaterals, circles, sectors",
        "3D volumes & surface areas — cube, cuboid, cylinder, cone, sphere",
        "Perimeter & area tricks for quick solving",
      ]},
      { moduleTitle: "Permutation, Combination & Probability", lessonTitles: [
        "Fundamental counting principle",
        "Permutations — nPr, circular, repetition allowed",
        "Combinations — nCr, selection problems",
        "Arrangements with identical elements",
        "Basic probability — sample space, events, P(A), P(A∪B)",
        "Conditional probability & Bayes' theorem (basic)",
        "Dice, coins, cards — standard exam questions",
      ]},
      { moduleTitle: "Logical Reasoning — Verbal", lessonTitles: [
        "Number series — arithmetic, geometric, mixed, difference patterns",
        "Letter series & alpha-numeric series",
        "Analogy — word, number, letter analogies",
        "Classification (odd one out)",
        "Coding-Decoding — letter shift, word coding, symbol coding",
        "Blood Relations — family tree approach",
        "Direction Sense — compass, turns, distances",
        "Syllogisms — Venn diagram method for All/Some/No statements",
      ]},
      { moduleTitle: "Logical Reasoning — Analytical", lessonTitles: [
        "Seating arrangement — linear (one row, two rows) & circular",
        "Scheduling & order puzzles",
        "Data Sufficiency — when is each statement alone or combined sufficient?",
        "Clocks & Calendars — angle between hands, day of week calculations",
        "Venn diagrams — 2-set & 3-set problems with formulas",
        "Statement & Conclusions / Assumptions / Courses of Action",
        "Input-Output (machine coding) problems",
      ]},
      { moduleTitle: "Data Interpretation", lessonTitles: [
        "Tables — reading and calculating % change, ratios from tables",
        "Bar graphs — single & multiple bar, reading & comparison",
        "Pie charts — degree & percentage conversion, problem solving",
        "Line graphs — trend analysis, slope & rate of change",
        "Mixed DI — combining two charts",
        "Caselets — data given as text paragraphs",
        "DI speed tricks — approximation & avoiding full calculation",
      ]},
      { moduleTitle: "Verbal Ability — Grammar & Comprehension", lessonTitles: [
        "Parts of speech — nouns, pronouns, verbs, adjectives, adverbs",
        "Tenses — all 12 tenses with usage rules",
        "Subject-verb agreement — tricky cases",
        "Articles — a, an, the; zero article",
        "Prepositions — at/in/on, time/place/direction",
        "Spotting errors — common exam error patterns",
        "Sentence correction & improvement",
        "Fill in the blanks — contextual vocabulary",
        "Synonyms, antonyms & one-word substitutions",
        "Idioms & phrases",
        "Para jumbles — link-word approach",
        "Reading Comprehension — skimming strategy, inference questions",
      ]},
      { moduleTitle: "Programming Logic & Pseudocode (TCS NQT style)", lessonTitles: [
        "Reading pseudocode — variable tracing step by step",
        "Loop tracing — for, while, do-while; nested loops",
        "Conditional logic — if/else chains, ternary",
        "Output prediction — C/C++ snippets (operators, printf, sizeof)",
        "Recursion tracing — call stack, base case identification",
        "Time complexity from code — counting iterations",
        "Common algorithms in pseudocode — swap, factorial, Fibonacci, GCD",
        "Bitwise operators — AND, OR, XOR, shifts; common tricks",
      ]},
    ],
  },
];

function slugId(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

async function deployCourse(
  c: typeof COURSES[0],
  quizMap: Record<string, { title: string; shortDescription: string }>,
) {
  // Convert { moduleTitle, lessonTitles[] } → CourseNoteOutlineChapter[]
  const notesOutline = c.notesOutline.map((m, chIdx) => {
    const chId = `ch-${slugId(m.moduleTitle)}`;
    return {
      id: chId,
      title: m.moduleTitle,
      description: "",
      order: chIdx,
      subtopics: m.lessonTitles.map((lt, ltIdx) => ({
        id: `${chId}-st${ltIdx}`,
        title: lt,
        summary: "",
        hasImages: false,
        videoCount: 0,
        order: ltIdx,
      })),
    };
  });

  // CourseNotesSummary
  const notesSummary = {
    chapterCount: notesOutline.length,
    subtopicCount: notesOutline.reduce((s, ch) => s + ch.subtopics.length, 0),
    imageCount: 0,
    videoCount: 0,
  };

  // CourseLinkedQuiz[]
  const linkedQuizzes = c.linkedQuizzes.map((slug) => {
    const info = quizMap[slug];
    return {
      id: slug, quizId: slug,
      title: info?.title || slug,
      description: info?.shortDescription || "",
      url: `/quizzes/${slug}`,
      status: "published",
    };
  });

  const ts = now();
  await db.collection("courses").doc(c.slug).set({
    slug: c.slug, title: c.title, description: c.description,
    shortDescription: c.description.slice(0, 200),
    thumbnailURL: null, price: c.price,
    compareAtPrice: c.price > 0 ? Math.round(c.price * 1.5) : null,
    accessType: c.accessType, category: c.category,
    tags: c.tags, difficulty: c.difficulty,
    estimatedHours: c.estimatedHours,
    notesOutline, notesSummary, linkedQuizzes,
    linkedTestSeriesIds: c.linkedTestSeriesIds,
    status: "published", visibility: "published",
    teacherId: "", classIds: [], isDeleted: false,
    createdAt: ts, updatedAt: ts, createdBy: "placement-content",
  });
  return { slug: c.slug, chapters: notesSummary.chapterCount, subtopics: notesSummary.subtopicCount };
}

(async () => {
  console.log("[deploy-courses] target=prod project=" + pid);
  // Load quiz metadata so linkedQuizzes objects have real titles
  const quizSnap = await db.collection("quizzes")
    .where("status", "==", "published").where("visibility", "==", "published").get();
  const quizMap: Record<string, { title: string; shortDescription: string }> = {};
  quizSnap.forEach(d => { quizMap[d.id] = { title: d.data().title || d.id, shortDescription: d.data().shortDescription || "" }; });

  for (const c of COURSES) {
    const r = await deployCourse(c, quizMap);
    console.log(`  ✓ ${r.slug}  (${r.chapters} chapters · ${r.subtopics} subtopics)`);
  }
  console.log("[deploy-courses] DONE → " + COURSES.length + " courses published.");
  process.exit(0);
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
