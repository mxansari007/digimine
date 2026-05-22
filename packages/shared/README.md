# @digimine/shared

Cross-app feature components and Firestore write helpers used by both the
admin portal (`apps/admin`) and the public web app (`apps/web`).

## When to put code here

Move code here when it satisfies **all** of:

- Used by more than one app (admin + teacher portal in web, etc.).
- Touches feature concerns (quiz / test / contest / course builders,
  Firestore writes, dashboard shell, file upload, etc.) — not low-level
  presentational primitives. Those belong in `@digimine/ui`.
- Is **not** a pure type — pure types belong in `@digimine/types`.

## Public surface

The package exports through `src/index.ts` only. Add a named re-export
there when introducing new modules:

```ts
// src/index.ts
export * from "./firestore/quizzes";
export * from "./builders/QuizForm";
```

## Auth dependency

Code here MUST NOT import a specific app's `AuthContext`. Components that
need the acting user receive it via props (`actingUser`,
`actingUserRole`). See `builders/QuizForm.tsx` for the canonical pattern.

## Firestore

Firestore write helpers (e.g. `createQuiz`) accept an optional
`teacherOverlay` so the web teacher portal can inject
`{ teacherId, visibility: "private", reviewStatus: "draft" }` without
duplicating the entire writer.
