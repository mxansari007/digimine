/**
 * Resume template registry: built-in templates (shipped in @digimine/types) +
 * admin-created custom templates stored in Firestore `appConfig/resumeTemplates`
 * (a single doc holding `templates: ResumeTemplateSpec[]`). Server-only.
 *
 * Custom specs always carry a `custom-` id prefix (see sanitizeTemplateSpec), so
 * they can never shadow a built-in; collisions among customs get a numeric
 * suffix on save.
 */
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import {
    BUILTIN_RESUME_TEMPLATES,
    sanitizeTemplateSpec,
    type ResumeTemplateSpec,
} from "@digimine/types";

const TEMPLATES_DOC = () => adminDb.collection("appConfig").doc("resumeTemplates");
const MAX_CUSTOM = 30;
const BUILTIN_IDS = new Set(BUILTIN_RESUME_TEMPLATES.map((t) => t.id));

/** Admin-created templates, validated. Never includes built-ins. */
export async function getCustomTemplates(): Promise<ResumeTemplateSpec[]> {
    const snap = await TEMPLATES_DOC().get();
    if (!snap.exists) return [];
    const raw = snap.data()?.templates;
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: ResumeTemplateSpec[] = [];
    raw.forEach((r, i) => {
        const spec = sanitizeTemplateSpec(r, i);
        if (!spec || BUILTIN_IDS.has(spec.id) || seen.has(spec.id)) return;
        seen.add(spec.id);
        out.push(spec);
    });
    return out.slice(0, MAX_CUSTOM);
}

/** All templates the student picker / renderer can use: built-ins + customs. */
export async function getAllTemplates(): Promise<ResumeTemplateSpec[]> {
    const customs = await getCustomTemplates();
    return [...BUILTIN_RESUME_TEMPLATES, ...customs];
}

/** Replace the custom template set (admin-only). Validates + de-dupes ids. */
export async function saveCustomTemplates(raw: unknown, uid: string): Promise<ResumeTemplateSpec[]> {
    const arr = Array.isArray(raw) ? raw : [];
    const seen = new Set<string>();
    const cleaned: ResumeTemplateSpec[] = [];
    arr.forEach((r, i) => {
        const spec = sanitizeTemplateSpec(r, i);
        if (!spec || BUILTIN_IDS.has(spec.id)) return;
        let id = spec.id;
        let n = 2;
        while (seen.has(id)) id = `${spec.id}-${n++}`;
        seen.add(id);
        cleaned.push({ ...spec, id });
    });
    const templates = cleaned.slice(0, MAX_CUSTOM);
    await TEMPLATES_DOC().set({ templates, updatedAt: Timestamp.now(), updatedBy: uid }, { merge: true });
    return templates;
}
