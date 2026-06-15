# Model update — Section · Subject · Timetable (read before building these screens)

## The problem
Today a teacher creates a "class" and names it after a **section** (e.g. "CSE-A"). But a section is taught by **many teachers**, each a different **subject**. So a student enrolled in 4 of their section's classes sees **"CSE-A" four times** — indistinguishable.

## The fix (display rule)
- **To the STUDENT → lead with the SUBJECT.** Show `Subject` (primary) + `teacher name` + `section` + `time` as the distinguishing line. The same section never repeats; the subject tells them apart.
- **To the TEACHER → lead with the SECTION.** A teacher usually teaches the *same subject* across several sections (CSE-A, CSE-B, ECE-A), so the **section** is what tells them apart (subject shown as secondary context).

It is the same relationship read from two sides:
- Student: one section, many **subjects** → distinguish by subject.
- Teacher: one subject, many **sections** → distinguish by section.

## Entities (for the web + mobile implementation that follows)
- **Section** — a cohort. `{ id, name ("CSE 6th Sem · A"), program, semester, studentCount }`. Students join a section.
- **SubjectClass** — the existing `class` doc + a new field. `{ id, teacherId, sectionId, subject (NEW, e.g. "Data Structures"), inviteCode, ...existing }`. One teacher · one subject · one section.
- **TimetableSlot / ClassSession (NEW)** — recurring meetings of a SubjectClass. `{ subjectClassId, day (mon..sat), startTime, endTime, room }`. A student's timetable = all slots of all their section's SubjectClasses.

Minimal migration: add `subject` + `meetings: TimetableSlot[]` to the class doc; group a student's classes by `sectionId`.

## Canonical demo dataset (use these EXACT names everywhere)
**Student "Maaz" → Section "CSE 6th Sem · A" (CSE-A), 42 students. Subjects:**
| Subject | Teacher | Slots | Room | My standing |
|---|---|---|---|---|
| Data Structures & Algorithms | Prof. Aman Verma | Mon/Wed/Fri 10:00–11:00 | Room 301 | #5 of 42 · 2 due |
| DBMS | Prof. Sara Khan | Tue/Thu 11:00–12:00 | Lab 2 | #11 of 42 |
| Operating Systems | Prof. Ravi Nair | Mon/Wed 12:00–13:00 | Room 305 | #8 of 42 · 1 due |
| Web Development | Prof. Sara Khan | Fri 14:00–16:00 | Lab 1 | #3 of 42 |

**Teacher "Aman Verma" → teaches *Data Structures* to 3 sections:**
| Section | Subject | Students | Avg | At-risk |
|---|---|---|---|---|
| CSE 6th Sem · A | Data Structures | 42 | 64 | 5 |
| CSE 6th Sem · B | Data Structures | 39 | 68 | 3 |
| ECE 5th Sem · A | Data Structures | 44 | 61 | 2 |

## Student timetable (weekly) — Monday example for CSE-A
- 10:00–11:00 Data Structures · Prof. Aman Verma · Room 301  (current period = "● Now", teal highlight)
- 11:00–12:00 Free
- 12:00–13:00 Operating Systems · Prof. Ravi Nair · Room 305
- 14:00–16:00 Web Development · Prof. Sara Khan · Lab 1
Use a day selector (Mon–Sat, today selected) + a vertical time-rail. Differentiate subjects by a teal-tinted initials avatar + text — NOT rainbow colors. Keep flare for live/urgent only.
