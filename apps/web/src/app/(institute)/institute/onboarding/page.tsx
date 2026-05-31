"use client";

/**
 * Step 2 of institute onboarding — collect institute details, create the
 * institute doc on the server, then show a confirmation screen with the
 * invite code that teachers will use to join.
 *
 * Two states:
 *   - "form"  → name + contact fields, gated on the phone step being done
 *   - "done"  → success screen with invite code + copy button + CTA to dashboard
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import {
    OnboardingShell,
    Stepper,
    StepHeader,
    FormField,
    textInputClass,
} from "@/components/onboarding";

const STEPS = ["Phone", "Institute"];

export default function InstituteOnboardingPage() {
    const router = useRouter();
    const { firebaseUser } = useAuthContext();
    const [step, setStep] = useState<"form" | "done">("form");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [institute, setInstitute] = useState<any>(null);
    const [copied, setCopied] = useState(false);

    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [contactEmail, setContactEmail] = useState("");
    const [contactPhone, setContactPhone] = useState("");
    const [website, setWebsite] = useState("");

    const handleSubmit = async () => {
        if (!firebaseUser) return;
        if (!name.trim()) {
            setError("Institute name is required");
            return;
        }
        setSubmitting(true);
        setError("");
        try {
            const res = await teacherFetch(firebaseUser, "/api/institute/register", {
                method: "POST",
                body: JSON.stringify({
                    name: name.trim(),
                    description: description.trim() || undefined,
                    contactEmail: contactEmail.trim() || undefined,
                    contactPhone: contactPhone.trim() || undefined,
                    website: website.trim() || undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                if (data.code === "phone_required") {
                    router.push("/institute/onboarding/phone");
                    return;
                }
                throw new Error(data.error || "Failed to register institute");
            }
            setInstitute(data.institute);
            setStep("done");
        } catch (err: any) {
            setError(err.message || "Failed to register institute");
        } finally {
            setSubmitting(false);
        }
    };

    const onCopyInvite = () => {
        if (!institute?.inviteCode) return;
        navigator.clipboard.writeText(institute.inviteCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    if (step === "done" && institute) {
        return (
            <OnboardingShell maxWidth="md">
                <div className="mb-8">
                    <Stepper steps={STEPS} current={STEPS.length} />
                </div>

                <div className="mb-6">
                    <StepHeader
                        eyebrow="Institute created"
                        title="You're all set"
                        subtitle="Share the invite code below with your teachers so they can join your institute."
                        icon={
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-6 w-6"
                                aria-hidden
                            >
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        }
                    />
                </div>

                <Card className="overflow-hidden p-6 sm:p-8">
                    <div className="text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {institute.name}
                        </p>
                        <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            Invite code
                        </p>
                        <div className="mt-2 inline-flex items-center gap-3 rounded-2xl border border-primary-100 dark:border-primary-500/25 bg-primary-50 dark:bg-primary-500/10 px-5 py-4">
                            <p className="font-mono text-2xl font-bold tracking-wider text-primary-900 dark:text-primary-300 sm:text-3xl">
                                {institute.inviteCode}
                            </p>
                            <button
                                type="button"
                                onClick={onCopyInvite}
                                className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-primary-700 shadow-sm ring-1 ring-primary-200 dark:ring-primary-500/25 transition-colors hover:bg-primary-100 dark:hover:bg-primary-500/15"
                            >
                                {copied ? "Copied!" : "Copy"}
                            </button>
                        </div>
                        <p className="mx-auto mt-4 max-w-sm text-xs text-slate-500">
                            Teachers redeem this from Teacher Portal → Join an institute. You can
                            always find it again in Institute Settings.
                        </p>
                    </div>

                    <div className="mt-8">
                        <Button
                            variant="primary"
                            className="w-full"
                            onClick={() => router.push("/institute/dashboard")}
                        >
                            Open dashboard
                        </Button>
                    </div>
                </Card>
            </OnboardingShell>
        );
    }

    return (
        <OnboardingShell maxWidth="2xl">
            <div className="mb-8">
                <Stepper steps={STEPS} current={1} />
            </div>

            <div className="mb-6">
                <StepHeader
                    title="Set up your institute"
                    subtitle="Quick details now — branding, logo, and address can wait. You can polish everything from Settings later."
                />
            </div>

            <Card className="overflow-hidden p-6 sm:p-8">
                <div className="space-y-5">
                    <FormField label="Institute name" required>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Future Coders Academy"
                            maxLength={120}
                            className={textInputClass}
                            disabled={submitting}
                        />
                    </FormField>

                    <FormField label="Description" hint="Optional">
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            placeholder="What does your institute teach? Who's it for?"
                            className={`${textInputClass} resize-none`}
                            disabled={submitting}
                        />
                    </FormField>

                    <div className="grid gap-5 sm:grid-cols-2">
                        <FormField label="Contact email" hint="Optional">
                            <input
                                type="email"
                                value={contactEmail}
                                onChange={(e) => setContactEmail(e.target.value)}
                                placeholder="hello@institute.com"
                                className={textInputClass}
                                disabled={submitting}
                            />
                        </FormField>
                        <FormField label="Contact phone" hint="Optional">
                            <input
                                type="tel"
                                value={contactPhone}
                                onChange={(e) => setContactPhone(e.target.value)}
                                placeholder="+91 …"
                                className={textInputClass}
                                disabled={submitting}
                            />
                        </FormField>
                    </div>

                    <FormField label="Website" hint="Optional">
                        <input
                            type="url"
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                            placeholder="https://your-institute.com"
                            className={textInputClass}
                            disabled={submitting}
                        />
                    </FormField>

                    {error && (
                        <div className="rounded-xl border border-rose-200 dark:border-rose-500/25 bg-rose-50 dark:bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
                            {error}
                        </div>
                    )}

                    <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-slate-500">
                            You can invite up to 5 teachers on the free trial.
                        </p>
                        <Button
                            variant="primary"
                            onClick={handleSubmit}
                            isLoading={submitting}
                            disabled={!name.trim() || submitting}
                            className="sm:min-w-[200px]"
                        >
                            Create institute
                        </Button>
                    </div>
                </div>
            </Card>
        </OnboardingShell>
    );
}
