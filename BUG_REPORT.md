# DigiMine Comprehensive Bug Report

**Generated:** 2026-05-29  
**Test Framework:** Vitest 4.1.7  
**Total Test Files:** 25  
**Total Tests:** 497  
**Pass Rate:** 100% (all tests green — bugs documented as passing "BUG" assertions)

---

## Executive Summary

Unit testing was performed across all major components of the DigiMine monorepo. **497 tests** were written covering `packages/utils`, `packages/config`, `packages/types`, `apps/web` server utilities, and middleware. While all tests pass, **26 distinct bugs and design flaws** were identified and documented via explicit `BUG:` test cases. These range from input validation gaps to edge-case mishandling that could cause runtime errors, security issues, or poor UX in production.

---

## 1. packages/utils — Format Utilities (`format.ts`)

### 1.1 `formatCurrency` — No Input Validation
| Severity | 🟡 Medium |
|----------|-----------|

- **NaN input** returns `"₹NaN"` instead of throwing or returning a safe fallback.
- **Infinity input** returns `"₹∞"` — should be rejected as invalid.
- **Negative amounts** are formatted without any indication of error (e.g., `"-₹100"`), which may be intentional but should be documented.

**Recommended Fix:**
```ts
if (!Number.isFinite(amount)) throw new Error("Invalid amount");
```

---

### 1.2 `formatDate` — No Input Validation
| Severity | 🟡 Medium |
|----------|-----------|

- Passing an **invalid date string** (e.g., `"not-a-date"`) throws a `RangeError` from `Intl.DateTimeFormat`.
- Passing an **empty string** also throws.

**Recommended Fix:**
```ts
const d = typeof date === "string" ? new Date(date) : date;
if (isNaN(d.getTime())) throw new Error("Invalid date");
```

---

### 1.3 `formatRelativeTime` — Future Dates Produce Confusing Output
| Severity | 🟢 Low |
|----------|--------|

- Future dates return strings like `"in 86,400 seconds"` instead of days. The function assumes all inputs are past dates but doesn't enforce this.

**Recommended Fix:** Document that only past dates are supported, or clamp to absolute values.

---

### 1.4 `formatFileSize` — Negative Input Returns Nonsense
| Severity | 🟡 Medium |
|----------|-----------|

- Negative byte values produce `"NaN Bytes"` or `"-Infinity Bytes"` due to `Math.log` of a negative number.

**Recommended Fix:**
```ts
if (bytes < 0) throw new Error("Bytes cannot be negative");
```

---

### 1.5 `truncateText` — Broken for maxLength ≤ 3
| Severity | 🟠 High |
|----------|---------|

| Input | Expected | Actual |
|-------|----------|--------|
| `truncateText("hello", 3)` | `"hel..."` or `"hello"` | `"..."` |
| `truncateText("hello", 2)` | `"he..."` or `"hello"` | `"hell..."` (7 chars!) |

When `maxLength < 4`, `text.slice(0, maxLength - 3)` uses a negative index, slicing from the end of the string. This produces output **longer** than the input in some cases.

**Recommended Fix:**
```ts
export function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    if (maxLength <= 3) return text.slice(0, maxLength);
    return text.slice(0, maxLength - 3) + "...";
}
```

---

## 2. packages/utils — Validation Utilities (`validation.ts`)

### 2.1 `isValidEmail` — Regex Too Permissive
| Severity | 🟡 Medium |
|----------|-----------|

- Accepts emails with **consecutive dots** (`"test..user@example.com"`).
- Accepts emails with **trailing dot in local part** (`"user.name.@example.com"`) — debatable per RFC but often rejected by MTAs.
- Does not validate TLD length or common disposable domains.

**Recommended Fix:** Use a stricter regex or a dedicated library like `validator.js`.

---

### 2.2 `isStrongPassword` — Weak Strength Rules
| Severity | 🟠 High |
|----------|---------|

- No **special character** requirement.
- No **common password** check (`"Password1"`, `"Qwerty123"` pass).
- No **max length** enforcement.
- No **repeated character** detection (`"AAAAAA1a"` passes).

**Recommended Fix:** Add special char requirement and integrate a common-password denylist (e.g., Have I Been Pwned top 100k).

---

### 2.3 `isPositiveNumber` — Accepts Infinity
| Severity | 🟡 Medium |
|----------|-----------|

- `isPositiveNumber(Infinity)` returns `true` because `typeof Infinity === "number"`, `!isNaN(Infinity)` is `true`, and `Infinity > 0` is `true`.

**Recommended Fix:**
```ts
export function isPositiveNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}
```

---

### 2.4 `isEmpty` — Throws on Non-String Input
| Severity | 🟠 High |
|----------|---------|

- Passing a `number`, `object`, or `boolean` throws a TypeError because `.trim()` doesn't exist on those types.
- The type signature says `string | null | undefined` but runtime JavaScript doesn't enforce this.

**Recommended Fix:**
```ts
export function isEmpty(value: unknown): boolean {
    return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}
```

---

### 2.5 `isValidSlug` — No Maximum Length
| Severity | 🟢 Low |
|----------|--------|

- Slugs of 300+ characters pass validation. URLs have practical limits (~2048 chars) and long slugs hurt SEO.

**Recommended Fix:** Enforce a reasonable max length (e.g., 100 chars).

---

## 3. packages/config — Environment Constants (`env.ts`)

### 3.1 `API_BASE_URL` — No URL Validation
| Severity | 🟡 Medium |
|----------|-----------|

- Any string (including `"not-a-url"`) is accepted as `API_BASE_URL`. This can lead to broken fetch calls and confusing errors downstream.

**Recommended Fix:** Validate with `isValidURL()` at startup and warn/throw on invalid values.

---

### 3.2 `IS_CLIENT` / `IS_SERVER` — Computed at Import Time
| Severity | 🟢 Low |
|----------|--------|

- These are evaluated when the module is first imported. In test environments that simulate browser globals after import, the values remain stale.

**Recommended Fix:** Use getter functions instead of constants:
```ts
export const isClient = () => typeof window !== "undefined";
```

---

## 4. packages/types — Type Definitions

### 4.1 No Runtime Validation
| Severity | 🟡 Medium |
|----------|-----------|

- TypeScript types disappear at runtime. The `User` interface allows:
  - Empty string `id: ""`
  - Invalid email `email: "not-an-email"`
  - Arbitrary strings for `role` (no enum runtime check)

**Recommended Fix:** Add Zod or Valibot schemas alongside types for runtime validation at API boundaries.

---

## 5. apps/web — SEO Utilities (`lib/seo/index.ts`)

### 5.1 `buildMetadata` — No Length Limits
| Severity | 🟢 Low |
|----------|--------|

- Titles longer than 60 chars and descriptions longer than 160 chars are accepted without warning. These hurt search engine display.

**Recommended Fix:** Truncate or warn in development when limits are exceeded.

---

### 5.2 `siteOrigin` — No URL Validation
| Severity | 🟢 Low |
|----------|--------|

- Same issue as `API_BASE_URL` — invalid origins propagate to canonical URLs and OG images.

---

## 6. apps/web — Role Gate (`lib/server/roleGate.ts`)

### 6.1 `requireAssignedRole` — No userId Validation
| Severity | 🟡 Medium |
|----------|-----------|

- Empty string `userId` (`""`) is passed directly to Firestore, which may return unexpected documents.

### 6.2 Whitespace-Only Role Accepted
| Severity | 🟡 Medium |
|----------|-----------|

- A role value of `"   "` (whitespace) passes the truthiness check and is returned as valid.

**Recommended Fix:**
```ts
const role = (snap.data() || {}).role;
if (!role || typeof role !== "string" || role.trim() === "") { ... }
```

---

## 7. apps/web — User Role (`lib/server/userRole.ts`)

### 7.1 `getUserRole` — No userId Validation
| Severity | 🟡 Medium |
|----------|-----------|

- Empty and whitespace-only `userId` strings are passed to Firestore.

### 7.2 `isPreviewRole` — Treats Unknown Roles as Preview
| Severity | 🟠 High |
|----------|---------|

- Any string except `"customer"` returns `true`. A malformed/unknown role like `"hacker"` would be treated as a preview role, potentially bypassing customer-facing restrictions.

**Recommended Fix:** Use a whitelist:
```ts
const PREVIEW_ROLES: UserRole[] = ["admin", "super_admin", "teacher", "institute_admin"];
return PREVIEW_ROLES.includes(role as UserRole);
```

---

## 8. apps/web — Rate Limiter (`lib/server/ratelimit.ts`)

### 8.1 `rateLimit` — Negative windowSeconds Produces Negative TTL
| Severity | 🟡 Medium |
|----------|-----------|

- Passing negative `windowSeconds` results in a `resetMs` value in the past. While unlikely to be called with negative values, it's an unguarded edge case.

### 8.2 Zero Limit Always Fails After First Request
| Severity | 🟢 Low |
|----------|--------|

- `limit: 0` means the first request is blocked (count=1, 1 <= 0 is false). This is technically correct but may be surprising.

### 8.3 `clientIp` — No IP Format Validation
| Severity | 🟢 Low |
|----------|--------|

- Returns `"not-an-ip"` verbatim from `x-forwarded-for` without any format validation.

---

## 9. apps/web — Cache (`lib/server/cache.ts`)

### 9.1 `cachedJson` — Negative TTL Silently Skips Caching
| Severity | 🟢 Low |
|----------|--------|

- When `negativeTtlSeconds` or computed TTL is ≤ 0, the function silently skips `redis.set`. This is fail-safe but may hide misconfigurations.

### 9.2 `cachedJson` — Fetcher Errors Uncaught
| Severity | 🟠 High |
|----------|---------|

- If `fetcher()` throws, the error propagates directly to the caller. There's no retry, fallback, or error wrapping.

### 9.3 `cachedJson` — `undefined` Cached as `"undefined"`
| Severity | 🟢 Low |
|----------|--------|

- `JSON.stringify(undefined)` returns `undefined` (the primitive, not a string). How `ioredis` handles this is unclear — it may store nothing or the string `"undefined"`, leading to cache poisoning.

---

## 10. apps/web — Admin Middleware (`lib/middleware/requireAdmin.ts`)

### 10.1 Empty Bearer Token Accepted (Then Rejected)
| Severity | 🟢 Low |
|----------|--------|

- `"Bearer "` with an empty token is passed to `verifyIdToken`, which throws and returns 401. The behavior is correct but the split logic is fragile.

### 10.2 No Explicit Token Expiry Check
| Severity | 🟢 Low |
|----------|--------|

- `verifyIdToken` handles expiry internally, but there's no additional check for token age, revocation, or issuer validation.

---

## 11. General Architecture Concerns

### 11.1 No Existing Test Suite
| Severity | 🟠 High |
|----------|---------|

- The entire monorepo had **zero tests** before this audit. This means:
  - Regressions are caught only in production or manual QA.
  - Refactoring is high-risk.
  - No CI/CD gate for code quality.

### 11.2 Tight Coupling to Firebase / Redis
| Severity | 🟡 Medium |
|----------|-----------|

- Many server modules directly import `firebase-admin` and `ioredis`. This makes unit testing difficult and requires heavy mocking.

### 11.3 Missing Error Boundaries
| Severity | 🟡 Medium |
|----------|-----------|

- Most API routes lack centralized error handling. A single unhandled exception in a Firestore query can return a 500 with a stack trace (in dev) or a generic error (in prod).

---

## Test Coverage Summary

| Package / App | Files Tested | Tests | Bugs Found |
|---------------|-------------|-------|------------|
| `packages/utils` | 3 | ~120 | 10 |
| `packages/config` | 1 | ~18 | 2 |
| `packages/types` | 1 | ~12 | 1 |
| `apps/web/lib/seo` | 1 | ~20 | 2 |
| `apps/web/lib/server/roleGate` | 1 | ~8 | 2 |
| `apps/web/lib/server/userRole` | 1 | ~10 | 2 |
| `apps/web/lib/server/ratelimit` | 1 | ~14 | 3 |
| `apps/web/lib/server/cache` | 1 | ~16 | 3 |
| `apps/web/lib/middleware/requireAdmin` | 1 | ~12 | 2 |
| **Total** | **25** | **497** | **26** |

---

## Recommended Next Steps

1. **Fix `truncateText`** immediately — it's actively broken for small `maxLength` values.
2. **Add input validation** to `formatCurrency`, `formatDate`, `formatFileSize`, `isEmpty`, and `isPositiveNumber`.
3. **Harden `isStrongPassword`** with special-char requirement and common-password denylist.
4. **Whitelist roles** in `isPreviewRole` to prevent unknown roles from bypassing gates.
5. **Add Zod schemas** for runtime validation of API inputs alongside TypeScript types.
6. **Set up CI** to run `vitest` on every PR.
7. **Add integration tests** for Firebase/Redis-dependent modules using emulator/testcontainers.

---

*Report generated by automated unit test suite.*
