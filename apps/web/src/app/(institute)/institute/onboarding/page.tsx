"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";

/**
 * Institute first-run wizard. Two screens:
 *   1. Welcome / name + contact form
 *   2. Confirmation with invite code to share with teachers
 */
export default function InstituteOnboardingPage() {
    const router = useRouter();
    const { firebaseUser } = useAuthContext();
    const [step, setStep] = useState<"form" | "done">("form");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [institute, setInstitute] = useState<any>(null);

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
                // Phone gate not satisfied — push them back to step 1.
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

    return (
        <div className="min-h-screen bg-slate-50 py-12 px-4">
            <div className="mx-auto max-w-2xl">
                <div className="mb-8 text-center">
                    <p className="chip-primary inline-flex">
                        {step === "done" ? "All set" : "Step 2 of 2"}
                    </p>
                    <h1 className="font-display mt-3 text-3xl font-bold text-slate-900 sm:text-4xl">
                        {step === "form" ? "Set up your institute" : "You're all set"}
                    </h1>
                    <p className="mt-2 text-sm text-slate-500">
                        {step === "form"
                            ? "Quick details first — you can polish branding later from Settings."
                            : "Share the invite code below with your teachers so they can join."}
                    </p>
                </div>

                {step === "form" && (
                    <div className="mb-6 flex justify-center gap-2">
                        <div className="h-1.5 w-12 rounded-full bg-primary-500" />
                        <div className="h-1.5 w-12 rounded-full bg-primary-500" />
                    </div>
                )}

                {step === "form" && (
                    <Card className="p-6 space-y-5">
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Institute name *
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Future Coders Academy"
                                maxLength={120}
                                className="field-input mt-2"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Description
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={3}
                                placeholder="What does your institute teach?"
                                className="field-input mt-2"
                            />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Contact email
                                </label>
                                <input
                                    type="email"
                                    value={contactEmail}
                                    onChange={(e) => setContactEmail(e.target.value)}
                                    placeholder="hello@institute.com"
                                    className="field-input mt-2"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Phone
                                </label>
                                <input
                                    type="tel"
                                    value={contactPhone}
                                    onChange={(e) => setContactPhone(e.target.value)}
                                    placeholder="+91 ..."
                                    className="field-input mt-2"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Website
                            </label>
                            <input
                                type="url"
                                value={website}
                                onChange={(e) => setWebsite(e.target.value)}
                                placeholder="https://your-institute.com"
                                className="field-input mt-2"
                            />
                        </div>

                        {error && <p className="text-sm text-rose-700">{error}</p>}

                        <div className="flex justify-end">
                            <Button variant="primary" onClick={handleSubmit} isLoading={submitting} disabled={!name.trim()}>
                                Create institute
                            </Button>
                        </div>
                    </Card>
                )}

                {step === "done" && institute && (
                    <Card className="p-8 text-center">
                        <p className="chip-success inline-flex">Institute created</p>
                        <h2 className="font-display mt-4 text-2xl font-bold text-slate-900">{institute.name}</h2>
                        <p className="mt-4 text-sm text-slate-500">Your institute invite code</p>
                        <p className="mt-2 font-mono text-3xl font-bold text-primary-700">
                            {institute.inviteCode}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                            Share this with teachers — they redeem it from Teacher Portal → Join an institute.
                        </p>
                        <div className="mt-8">
                            <Button variant="primary" onClick={() => router.push("/institute/dashboard")}>
                                Open dashboard
                            </Button>
                        </div>
                    </Card>
                )}
            </div>
        </div>
    );
}
