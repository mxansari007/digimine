/**
 * Admin accessors for the AI credit economy config (`appConfig/aiCredits`).
 * Read/written directly with the client SDK — appConfig is admin-writable
 * by rules. Wallet grants and ledger views go through the web app's
 * /api/admin/credits route instead (they need the Admin SDK).
 */
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import {
    DEFAULT_AI_CREDITS_CONFIG,
    DEFAULT_AI_CREDIT_RATES,
    type AiCreditsConfig,
    type AiCreditTask,
    type CreditPack,
} from "@digimine/types";
import { db } from "@/lib/firebase/client";

const CREDITS_CONFIG_REF = () => doc(db, "appConfig", "aiCredits");

function mapPack(raw: any, index: number): CreditPack | null {
    if (!raw || typeof raw !== "object") return null;
    const credits = typeof raw.credits === "number" ? Math.floor(raw.credits) : 0;
    const priceINR = typeof raw.priceINR === "number" ? raw.priceINR : 0;
    if (credits <= 0 || priceINR <= 0) return null;
    return {
        id: typeof raw.id === "string" && raw.id ? raw.id : `pack-${index}`,
        name: typeof raw.name === "string" && raw.name ? raw.name : `${credits} credits`,
        credits,
        bonusCredits:
            typeof raw.bonusCredits === "number" && raw.bonusCredits > 0
                ? Math.floor(raw.bonusCredits)
                : 0,
        priceINR,
        compareAtINR:
            typeof raw.compareAtINR === "number" && raw.compareAtINR > priceINR
                ? raw.compareAtINR
                : null,
        badge: typeof raw.badge === "string" && raw.badge ? raw.badge : null,
        active: raw.active !== false,
        sortOrder: typeof raw.sortOrder === "number" ? raw.sortOrder : index,
    };
}

export async function getAiCreditsConfig(): Promise<AiCreditsConfig> {
    const snap = await getDoc(CREDITS_CONFIG_REF());
    if (!snap.exists()) return DEFAULT_AI_CREDITS_CONFIG;
    const d = snap.data() || {};
    const rates = { ...DEFAULT_AI_CREDIT_RATES };
    for (const key of Object.keys(rates) as AiCreditTask[]) {
        const v = d.rates?.[key];
        if (typeof v === "number" && v >= 0) rates[key] = Math.floor(v);
    }
    return {
        enabled: Boolean(d.enabled),
        rates,
        welcomeCredits:
            typeof d.welcomeCredits === "number" && d.welcomeCredits > 0
                ? Math.floor(d.welcomeCredits)
                : 0,
        packs: Array.isArray(d.packs)
            ? (d.packs.map(mapPack).filter(Boolean) as CreditPack[])
            : [],
        updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate() : new Date(0),
        updatedBy: d.updatedBy ?? null,
    };
}

export async function saveAiCreditsConfig(
    cfg: AiCreditsConfig,
    adminUid: string
): Promise<void> {
    await setDoc(
        CREDITS_CONFIG_REF(),
        {
            enabled: Boolean(cfg.enabled),
            rates: cfg.rates,
            welcomeCredits: Math.max(0, Math.floor(cfg.welcomeCredits || 0)),
            packs: cfg.packs.map((p, i) => ({
                id: p.id || `pack-${Date.now().toString(36)}-${i}`,
                name: p.name,
                credits: Math.max(1, Math.floor(p.credits)),
                bonusCredits: Math.max(0, Math.floor(p.bonusCredits || 0)),
                priceINR: Math.max(1, p.priceINR),
                compareAtINR: p.compareAtINR ?? null,
                badge: p.badge ?? null,
                active: p.active !== false,
                sortOrder: i,
            })),
            updatedAt: serverTimestamp(),
            updatedBy: adminUid,
        },
        { merge: true }
    );
}
