"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, useToast } from "@digimine/ui";
import { useAuthContext } from "@/contexts/AuthContext";
import { teacherFetch } from "@/lib/api/teacherFetch";
import { HelpTutorial } from "@/components/help/HelpTutorial";
import { TUTORIALS } from "@/components/help/tutorials";

export default function InstituteSettingsPage() {
    const { firebaseUser } = useAuthContext();
    const toast = useToast();
    const [instituteId, setInstituteId] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [contactEmail, setContactEmail] = useState("");
    const [contactPhone, setContactPhone] = useState("");
    const [website, setWebsite] = useState("");
    const [address, setAddress] = useState("");
    const [tagline, setTagline] = useState("");
    const [inviteCode, setInviteCode] = useState("");

    const load = useCallback(async () => {
        if (!firebaseUser) return;
        setLoading(true);
        setError("");
        try {
            const res = await teacherFetch(firebaseUser, "/api/institute/me");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            const inst = data.institute;
            setInstituteId(inst.id);
            setName(inst.name);
            setDescription(inst.description || "");
            setContactEmail(inst.contactEmail || "");
            setContactPhone(inst.contactPhone || "");
            setWebsite(inst.website || "");
            setAddress(inst.address || "");
            setTagline(inst.branding?.tagline || "");
            setInviteCode(inst.inviteCode);
        } catch (err: any) {
            setError(err.message || "Failed");
        } finally {
            setLoading(false);
        }
    }, [firebaseUser]);

    useEffect(() => {
        load();
    }, [load]);

    const handleSave = async () => {
        if (!firebaseUser || !instituteId) return;
        setSaving(true);
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/institute/${encodeURIComponent(instituteId)}`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        name: name.trim(),
                        description: description.trim() || null,
                        contactEmail: contactEmail.trim() || null,
                        contactPhone: contactPhone.trim() || null,
                        website: website.trim() || null,
                        address: address.trim() || null,
                        branding: { tagline: tagline.trim() || null },
                    }),
                }
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            setInviteCode(data.institute.inviteCode);
            toast.success("Settings saved");
        } catch (err: any) {
            toast.error(err.message || "Could not save settings.");
        } finally {
            setSaving(false);
        }
    };

    const handleRegenerateInvite = async () => {
        if (!firebaseUser || !instituteId) return;
        if (!confirm("Regenerate? The current invite code will stop working.")) return;
        try {
            const res = await teacherFetch(
                firebaseUser,
                `/api/institute/${encodeURIComponent(instituteId)}`,
                { method: "PATCH", body: JSON.stringify({ regenerateInviteCode: true }) }
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            setInviteCode(data.institute.inviteCode);
            toast.success("Invite code rotated", {
                description: "Share the new code with your teachers — the old one is no longer valid.",
            });
        } catch (err: any) {
            toast.error(err.message || "Could not regenerate invite code.");
        }
    };

    if (loading) return <div className="py-20 text-center text-gray-500">Loading...</div>;

    return (
        <div className="space-y-6">
            <div>
                <div className="flex items-center gap-1.5">
                    <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
                    <HelpTutorial {...TUTORIALS.institute_settings} />
                </div>
                <p className="mt-1 text-gray-500">Institute identity, contact info, branding.</p>
            </div>

            {error && <Card className="p-4 text-sm text-rose-700 border-rose-200 bg-rose-50">{error}</Card>}

            <Card className="p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Identity</h3>
                <p className="text-xs text-gray-500 mb-4">How your institute appears to teachers and students.</p>
                <div className="grid gap-4">
                    <div>
                        <label className="stat-label">Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={120}
                            className="field-input mt-1.5"
                        />
                    </div>
                    <div>
                        <label className="stat-label">Tagline (optional)</label>
                        <input
                            type="text"
                            value={tagline}
                            onChange={(e) => setTagline(e.target.value)}
                            placeholder="e.g. Building India's next engineers"
                            className="field-input mt-1.5"
                        />
                    </div>
                    <div>
                        <label className="stat-label">Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            className="field-input mt-1.5"
                        />
                    </div>
                </div>
            </Card>

            <Card className="p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Contact</h3>
                <p className="text-xs text-gray-500 mb-4">Public-facing contact details for your institute.</p>
                <div className="grid gap-4 md:grid-cols-2">
                    <div>
                        <label className="stat-label">Email</label>
                        <input
                            type="email"
                            value={contactEmail}
                            onChange={(e) => setContactEmail(e.target.value)}
                            className="field-input mt-1.5"
                        />
                    </div>
                    <div>
                        <label className="stat-label">Phone</label>
                        <input
                            type="tel"
                            value={contactPhone}
                            onChange={(e) => setContactPhone(e.target.value)}
                            className="field-input mt-1.5"
                        />
                    </div>
                    <div>
                        <label className="stat-label">Website</label>
                        <input
                            type="url"
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                            className="field-input mt-1.5"
                        />
                    </div>
                    <div>
                        <label className="stat-label">Address</label>
                        <input
                            type="text"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            className="field-input mt-1.5"
                        />
                    </div>
                </div>
            </Card>

            <Card className="p-6 accent-card">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Teacher invite code</h3>
                <p className="text-xs text-gray-500 mb-4">
                    Teachers redeem this from their teacher portal to join your institute.
                </p>
                <p className="font-mono text-2xl font-bold text-primary-700">{inviteCode}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                    <button
                        onClick={() => navigator.clipboard.writeText(inviteCode)}
                        className="font-semibold text-primary-700 hover:text-primary-800"
                    >
                        Copy code
                    </button>
                    <button
                        onClick={handleRegenerateInvite}
                        className="font-semibold text-amber-700 hover:text-amber-800"
                    >
                        Regenerate
                    </button>
                </div>
            </Card>

            <div className="flex justify-end">
                <Button variant="primary" onClick={handleSave} isLoading={saving}>
                    Save changes
                </Button>
            </div>
        </div>
    );
}
