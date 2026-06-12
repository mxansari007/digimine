"use client";

/**
 * Reusable personal-profile editor backed by the caller's own `users/{uid}`
 * document. Shared by the teacher and institute profile pages so both edit
 * the same identity fields (name, phone, avatar, short intro) with one code
 * path. The student profile page keeps its richer, purchase-aware form.
 *
 * `showLinks` adds the GitHub / LinkedIn / portfolio row — useful for
 * teachers who share a professional presence, off by default for institute
 * admins.
 */
import { useEffect, useState } from "react";
import { doc, updateDoc, Timestamp } from "firebase/firestore";
import { Button, Card, useToast } from "@digimine/ui";
import { FileUpload } from "@digimine/shared";
import { useAuthContext } from "@/contexts/AuthContext";
import { db, storage } from "@/lib/firebase/client";

function normalizeUrl(v: string): string | null {
    const t = v.trim();
    if (!t) return null;
    return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export function AccountProfileCard({
    showLinks = false,
    title = "Personal information",
    description = "Your name, contact details, and how you appear across the platform.",
}: {
    showLinks?: boolean;
    title?: string;
    description?: string;
}) {
    const { user, firebaseUser } = useAuthContext();
    const toast = useToast();

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [phoneNumber, setPhoneNumber] = useState("");
    const [photoURL, setPhotoURL] = useState("");
    const [headline, setHeadline] = useState("");
    const [bio, setBio] = useState("");
    const [github, setGithub] = useState("");
    const [linkedin, setLinkedin] = useState("");
    const [portfolio, setPortfolio] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!user) return;
        setFirstName(user.firstName || "");
        setLastName(user.lastName || "");
        setPhoneNumber(user.phoneNumber || "");
        setPhotoURL(user.photoURL || "");
        setHeadline(user.headline || "");
        setBio(user.bio || "");
        setGithub(user.links?.github || "");
        setLinkedin(user.links?.linkedin || "");
        setPortfolio(user.links?.portfolio || "");
    }, [user]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firebaseUser) return;
        setSaving(true);
        try {
            const displayName = `${firstName} ${lastName}`.trim();
            const updates: Record<string, unknown> = {
                firstName,
                lastName,
                displayName,
                phoneNumber: phoneNumber || null,
                photoURL: photoURL || null,
                headline: headline.trim().slice(0, 120) || null,
                bio: bio.trim().slice(0, 1000) || null,
                updatedAt: Timestamp.now(),
            };
            if (showLinks) {
                updates.links = {
                    github: normalizeUrl(github),
                    linkedin: normalizeUrl(linkedin),
                    portfolio: normalizeUrl(portfolio),
                };
            }
            await updateDoc(doc(db, "users", firebaseUser.uid), updates);
            toast.success("Profile updated");
        } catch {
            toast.error("Failed to update profile.");
        } finally {
            setSaving(false);
        }
    };

    if (!user) {
        return (
            <Card padding="lg">
                <div className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            </Card>
        );
    }

    return (
        <Card padding="lg">
            <h2 className="font-display text-lg font-semibold text-gray-900">{title}</h2>
            <p className="mt-0.5 text-sm text-gray-500">{description}</p>

            <form onSubmit={handleSave} className="mt-5 space-y-5">
                {/* Avatar */}
                <div className="flex items-center gap-4">
                    {photoURL ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={photoURL}
                            alt="Profile photo"
                            className="h-16 w-16 rounded-full object-cover ring-2 ring-slate-200 dark:ring-slate-700"
                        />
                    ) : (
                        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-500/20 text-xl font-bold text-primary-700 dark:text-primary-300">
                            {(firstName[0] || firebaseUser?.email?.[0] || "?").toUpperCase()}
                        </span>
                    )}
                    <div className="flex-1">
                        <FileUpload
                            label=""
                            path={`users/${firebaseUser?.uid || "anon"}/avatar`}
                            accept="image/*"
                            storage={storage}
                            existingUrl={photoURL || undefined}
                            onUploadComplete={(url) => setPhotoURL(url)}
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            Shown next to your name across the platform. Save to apply.
                        </p>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label htmlFor="firstName" className="stat-label">
                            First name
                        </label>
                        <input
                            id="firstName"
                            type="text"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            className="field-input mt-1.5"
                            placeholder="John"
                        />
                    </div>
                    <div>
                        <label htmlFor="lastName" className="stat-label">
                            Last name
                        </label>
                        <input
                            id="lastName"
                            type="text"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            className="field-input mt-1.5"
                            placeholder="Doe"
                        />
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label htmlFor="email" className="stat-label">
                            Email address
                        </label>
                        <input
                            id="email"
                            type="email"
                            value={firebaseUser?.email || ""}
                            disabled
                            className="field-input mt-1.5 cursor-not-allowed opacity-70"
                        />
                        <p className="mt-1 text-xs text-gray-400">Email can&apos;t be changed.</p>
                    </div>
                    <div>
                        <label htmlFor="phone" className="stat-label">
                            Phone number
                        </label>
                        <input
                            id="phone"
                            type="tel"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            className="field-input mt-1.5"
                            placeholder="+91 98765 43210"
                        />
                    </div>
                </div>

                <div>
                    <label htmlFor="headline" className="stat-label">
                        Headline
                    </label>
                    <input
                        id="headline"
                        type="text"
                        value={headline}
                        onChange={(e) => setHeadline(e.target.value)}
                        maxLength={120}
                        className="field-input mt-1.5"
                        placeholder='e.g. "Full-stack instructor · 8 yrs industry experience"'
                    />
                </div>

                <div>
                    <label htmlFor="bio" className="stat-label">
                        About you
                    </label>
                    <textarea
                        id="bio"
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        maxLength={1000}
                        rows={3}
                        className="field-input mt-1.5"
                        placeholder="A short introduction shown to your students and colleagues."
                    />
                </div>

                {showLinks && (
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div>
                            <label htmlFor="github" className="stat-label">
                                GitHub
                            </label>
                            <input
                                id="github"
                                type="text"
                                value={github}
                                onChange={(e) => setGithub(e.target.value)}
                                className="field-input mt-1.5"
                                placeholder="github.com/you"
                            />
                        </div>
                        <div>
                            <label htmlFor="linkedin" className="stat-label">
                                LinkedIn
                            </label>
                            <input
                                id="linkedin"
                                type="text"
                                value={linkedin}
                                onChange={(e) => setLinkedin(e.target.value)}
                                className="field-input mt-1.5"
                                placeholder="linkedin.com/in/you"
                            />
                        </div>
                        <div>
                            <label htmlFor="portfolio" className="stat-label">
                                Portfolio
                            </label>
                            <input
                                id="portfolio"
                                type="text"
                                value={portfolio}
                                onChange={(e) => setPortfolio(e.target.value)}
                                className="field-input mt-1.5"
                                placeholder="you.dev"
                            />
                        </div>
                    </div>
                )}

                <div className="flex justify-end">
                    <Button type="submit" variant="primary" isLoading={saving}>
                        Save changes
                    </Button>
                </div>
            </form>
        </Card>
    );
}
