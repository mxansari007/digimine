"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button, Card } from "@digimine/ui";
import { FileUpload } from "@digimine/shared";
import { useAuthContext } from "@/contexts/AuthContext";
import { doc, updateDoc, collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db, storage } from "@/lib/firebase/client";
import { formatCurrency } from "@digimine/utils";
import { getUserTestPurchases, getTestSeriesBySlug } from "@/lib/firestore/tests";
import type { Order, TestPurchase } from "@digimine/types";
import { PageLoading } from "@/components/common";
import { SecuritySettings } from "@/components/account/SecuritySettings";

export default function ProfilePage() {
    const { user, firebaseUser } = useAuthContext();

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [phoneNumber, setPhoneNumber] = useState("");
    // Public profile — shown in classroom discussions, DMs, and People pages.
    const [photoURL, setPhotoURL] = useState("");
    const [headline, setHeadline] = useState("");
    const [bio, setBio] = useState("");
    const [college, setCollege] = useState("");
    const [gradYear, setGradYear] = useState("");
    const [skillsInput, setSkillsInput] = useState("");
    const [github, setGithub] = useState("");
    const [linkedin, setLinkedin] = useState("");
    const [portfolio, setPortfolio] = useState("");
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{
        type: "success" | "error";
        text: string;
    } | null>(null);

    // Purchase history
    const [orders, setOrders] = useState<Order[]>([]);
    const [testPurchases, setTestPurchases] = useState<Array<TestPurchase & { seriesTitle?: string }>>([]);
    const [loadingOrders, setLoadingOrders] = useState(true);

    // Initialize form with user data
    useEffect(() => {
        if (user) {
            setFirstName(user.firstName || "");
            setLastName(user.lastName || "");
            setPhoneNumber(user.phoneNumber || "");
            setPhotoURL(user.photoURL || "");
            setHeadline(user.headline || "");
            setBio(user.bio || "");
            setCollege(user.college || "");
            setGradYear(user.gradYear ? String(user.gradYear) : "");
            setSkillsInput((user.skills || []).join(", "));
            setGithub(user.links?.github || "");
            setLinkedin(user.links?.linkedin || "");
            setPortfolio(user.links?.portfolio || "");
        }
    }, [user]);

    // Fetch purchase history
    useEffect(() => {
        if (!firebaseUser) {
            setLoadingOrders(false);
            return;
        }

        async function fetchOrders() {
            try {
                // Query by userId
                const userIdQuery = query(
                    collection(db, "orders"),
                    where("userId", "==", firebaseUser!.uid)
                );
                const userIdSnapshot = await getDocs(userIdQuery);

                // Also query by email for guest orders that weren't linked
                const emailQuery = query(
                    collection(db, "orders"),
                    where("customerEmail", "==", firebaseUser!.email)
                );
                const emailSnapshot = await getDocs(emailQuery);

                // Combine and deduplicate orders
                const orderMap = new Map<string, Order>();

                [...userIdSnapshot.docs, ...emailSnapshot.docs].forEach(doc => {
                    if (!orderMap.has(doc.id)) {
                        const data = doc.data();
                        orderMap.set(doc.id, {
                            id: doc.id,
                            ...data,
                            createdAt: data.createdAt?.toDate() || new Date(),
                            updatedAt: data.updatedAt?.toDate() || new Date(),
                        } as Order);
                    }
                });

                const orderData = Array.from(orderMap.values());

                // Sort by date descending
                orderData.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
                setOrders(orderData);

                // Fetch test series purchases
                const purchases = await getUserTestPurchases(firebaseUser!.uid);
                const purchasesWithTitles = await Promise.all(
                    purchases.map(async (purchase) => {
                        const series = await getTestSeriesBySlug(purchase.seriesId);
                        return { ...purchase, seriesTitle: series?.title || purchase.seriesId };
                    })
                );
                setTestPurchases(purchasesWithTitles);
            } catch (err) {
                console.error("Error fetching orders:", err);
            } finally {
                setLoadingOrders(false);
            }
        }
        fetchOrders();
    }, [firebaseUser]);

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firebaseUser) return;

        setSaving(true);
        setMessage(null);

        try {
            const displayName = `${firstName} ${lastName}`.trim();
            const yearNum = parseInt(gradYear, 10);
            const normalizeUrl = (v: string) => {
                const t = v.trim();
                if (!t) return null;
                return /^https?:\/\//i.test(t) ? t : `https://${t}`;
            };
            await updateDoc(doc(db, "users", firebaseUser.uid), {
                firstName,
                lastName,
                displayName,
                phoneNumber: phoneNumber || null,
                photoURL: photoURL || null,
                headline: headline.trim().slice(0, 120) || null,
                bio: bio.trim().slice(0, 1000) || null,
                college: college.trim().slice(0, 120) || null,
                gradYear: Number.isFinite(yearNum) && yearNum > 2000 && yearNum < 2100 ? yearNum : null,
                skills: skillsInput
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .slice(0, 12),
                links: {
                    github: normalizeUrl(github),
                    linkedin: normalizeUrl(linkedin),
                    portfolio: normalizeUrl(portfolio),
                },
                updatedAt: Timestamp.now(),
            });
            setMessage({ type: "success", text: "Profile updated successfully!" });
        } catch (err) {
            console.error("Error updating profile:", err);
            setMessage({ type: "error", text: "Failed to update profile" });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            {/* Header */}
            <div className="mb-8">
                <h1 className="font-display text-2xl font-bold text-gray-900 mb-2">
                    Profile Settings
                </h1>
                <p className="text-gray-600">
                    Manage your account settings and view purchases
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Profile Form */}
                <div className="lg:col-span-2 space-y-6">
                    <Card padding="lg">
                        <h2 className="font-display text-lg font-semibold text-gray-900 mb-6">
                            Personal Information
                        </h2>

                        <form onSubmit={handleUpdateProfile} className="space-y-6">
                            {message && (
                                <div
                                    className={`px-4 py-3 rounded-lg text-sm ${message.type === "success"
                                        ? "bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/25 text-green-700 dark:text-green-300"
                                        : "bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 text-red-700 dark:text-red-300"
                                        }`}
                                >
                                    {message.text}
                                </div>
                            )}

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
                                        Shown next to your posts, messages, and on your class&apos;s
                                        People page. Save changes to apply.
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label
                                        htmlFor="firstName"
                                        className="block text-sm font-medium text-gray-700 mb-1"
                                    >
                                        First Name
                                    </label>
                                    <input
                                        id="firstName"
                                        type="text"
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                                        placeholder="John"
                                    />
                                </div>
                                <div>
                                    <label
                                        htmlFor="lastName"
                                        className="block text-sm font-medium text-gray-700 mb-1"
                                    >
                                        Last Name
                                    </label>
                                    <input
                                        id="lastName"
                                        type="text"
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                                        placeholder="Doe"
                                    />
                                </div>
                            </div>

                            <div>
                                <label
                                    htmlFor="email"
                                    className="block text-sm font-medium text-gray-700 mb-1"
                                >
                                    Email Address
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    value={firebaseUser?.email || ""}
                                    disabled
                                    className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-gray-50 text-gray-500"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Email cannot be changed
                                </p>
                            </div>

                            <div>
                                <label
                                    htmlFor="phone"
                                    className="block text-sm font-medium text-gray-700 mb-1"
                                >
                                    Phone Number
                                </label>
                                <input
                                    id="phone"
                                    type="tel"
                                    value={phoneNumber}
                                    onChange={(e) => setPhoneNumber(e.target.value)}
                                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                                    placeholder="+91 98765 43210"
                                />
                            </div>

                            {/* Public profile */}
                            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                                <h3 className="font-display text-base font-semibold text-gray-900">
                                    Public profile
                                </h3>
                                <p className="mt-0.5 text-xs text-gray-500">
                                    Classmates and teachers see this in discussions, messages, and
                                    the People page.
                                </p>
                                <div className="mt-4 space-y-4">
                                    <div>
                                        <label htmlFor="headline" className="block text-sm font-medium text-gray-700 mb-1">
                                            Headline
                                        </label>
                                        <input
                                            id="headline"
                                            type="text"
                                            value={headline}
                                            onChange={(e) => setHeadline(e.target.value)}
                                            maxLength={120}
                                            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                                            placeholder='e.g. "Final-year CSE · aiming for SDE roles"'
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-1">
                                            About you
                                        </label>
                                        <textarea
                                            id="bio"
                                            value={bio}
                                            onChange={(e) => setBio(e.target.value)}
                                            maxLength={1000}
                                            className="w-full min-h-[80px] px-4 py-3 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                                            placeholder="What you're studying, what you're building, what you want help with."
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label htmlFor="college" className="block text-sm font-medium text-gray-700 mb-1">
                                                College
                                            </label>
                                            <input
                                                id="college"
                                                type="text"
                                                value={college}
                                                onChange={(e) => setCollege(e.target.value)}
                                                maxLength={120}
                                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                                                placeholder="Chandigarh University"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="gradYear" className="block text-sm font-medium text-gray-700 mb-1">
                                                Graduation year
                                            </label>
                                            <input
                                                id="gradYear"
                                                type="text"
                                                inputMode="numeric"
                                                value={gradYear}
                                                onChange={(e) => setGradYear(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                                                placeholder="2027"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label htmlFor="skills" className="block text-sm font-medium text-gray-700 mb-1">
                                            Skills <span className="font-normal text-gray-400">· comma-separated</span>
                                        </label>
                                        <input
                                            id="skills"
                                            type="text"
                                            value={skillsInput}
                                            onChange={(e) => setSkillsInput(e.target.value)}
                                            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                                            placeholder="React, Node.js, SQL, DSA"
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div>
                                            <label htmlFor="github" className="block text-sm font-medium text-gray-700 mb-1">
                                                GitHub
                                            </label>
                                            <input
                                                id="github"
                                                type="text"
                                                value={github}
                                                onChange={(e) => setGithub(e.target.value)}
                                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                                                placeholder="github.com/you"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="linkedin" className="block text-sm font-medium text-gray-700 mb-1">
                                                LinkedIn
                                            </label>
                                            <input
                                                id="linkedin"
                                                type="text"
                                                value={linkedin}
                                                onChange={(e) => setLinkedin(e.target.value)}
                                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                                                placeholder="linkedin.com/in/you"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="portfolio" className="block text-sm font-medium text-gray-700 mb-1">
                                                Portfolio
                                            </label>
                                            <input
                                                id="portfolio"
                                                type="text"
                                                value={portfolio}
                                                onChange={(e) => setPortfolio(e.target.value)}
                                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 transition-all"
                                                placeholder="you.dev"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <Button
                                    type="submit"
                                    variant="primary"
                                    isLoading={saving}
                                >
                                    Save Changes
                                </Button>
                            </div>
                        </form>
                    </Card>

                    {/* Security */}
                    <SecuritySettings />

                    {/* Purchase History */}
                    <Card padding="lg">
                        <h2 className="font-display text-lg font-semibold text-gray-900 mb-6">
                            Enrollments &amp; Billing
                        </h2>

                        {loadingOrders ? (
                            <PageLoading variant="inline" />
                        ) : orders.length === 0 ? (
                            <div className="text-center py-8">
                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                                    </svg>
                                </div>
                                <p className="text-gray-500 mb-4">You haven&apos;t enrolled in anything yet</p>
                                <Link href="/products">
                                    <Button variant="primary" size="sm">Browse courses</Button>
                                </Link>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {orders.map((order) => (
                                    <div key={order.id} className="border border-gray-200 rounded-lg p-4">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <p className="text-sm font-medium text-gray-900">
                                                    Order #{order.id.slice(0, 8)}...
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    {new Date(order.createdAt).toLocaleDateString('en-IN', {
                                                        year: 'numeric',
                                                        month: 'short',
                                                        day: 'numeric'
                                                    })}
                                                </p>
                                            </div>
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${order.status === 'completed'
                                                ? 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300'
                                                : 'bg-yellow-100 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-300'
                                                }`}>
                                                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                                            </span>
                                        </div>
                                        <div className="space-y-2">
                                            {order.items.map((item, idx) => (
                                                <div key={idx} className="flex justify-between text-sm">
                                                    <span className="text-gray-600">{item.productName}</span>
                                                    <span className="text-gray-900">{formatCurrency(item.price)}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="border-t border-gray-100 mt-3 pt-3 flex justify-between font-medium">
                                            <span>Total</span>
                                            <span>{formatCurrency(order.total)}</span>
                                        </div>
                                    </div>
                                ))}

                                {/* Test Series Purchases */}
                                {testPurchases.length > 0 && (
                                    <>
                                        <div className="pt-2 pb-1">
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Test Series Purchases</p>
                                        </div>
                                        {testPurchases.map((purchase) => (
                                            <div key={purchase.id} className="border border-gray-200 rounded-lg p-4">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900">
                                                            {purchase.seriesTitle}
                                                        </p>
                                                        <p className="text-xs text-gray-500">
                                                            {new Date(purchase.purchasedAt).toLocaleDateString('en-IN', {
                                                                year: 'numeric',
                                                                month: 'short',
                                                                day: 'numeric'
                                                            })}
                                                        </p>
                                                    </div>
                                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${purchase.status === 'active'
                                                        ? 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300'
                                                        : 'bg-gray-100 text-gray-600'
                                                        }`}>
                                                        {purchase.status.charAt(0).toUpperCase() + purchase.status.slice(1)}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-gray-600">Test Series Access</span>
                                                    <span className="text-gray-900">{formatCurrency(purchase.price)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                        )}
                    </Card>
                </div>

                {/* Sidebar */}
                <div>
                    {/* Account Info */}
                    <Card padding="lg">
                        <h3 className="font-semibold text-gray-900 mb-4">Account</h3>
                        <div className="space-y-4">
                            <div>
                                <p className="text-sm text-gray-500">Member Since</p>
                                <p className="text-gray-900">
                                    {user?.createdAt
                                        ? new Date(user.createdAt).toLocaleDateString()
                                        : "N/A"}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Account Type</p>
                                <p className="text-gray-900 capitalize">{user?.role || "Student"}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Courses unlocked</p>
                                <p className="text-gray-900">{user?.purchasedProducts?.length || 0}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Test series</p>
                                <p className="text-gray-900">{testPurchases.length}</p>
                            </div>
                        </div>
                    </Card>

                    {/* My Downloads Quick Access */}
                    {user?.purchasedProducts && user.purchasedProducts.length > 0 && (
                        <Card padding="lg" className="mt-6">
                            <h3 className="font-semibold text-gray-900 mb-4">Course materials</h3>
                            <p className="text-sm text-gray-500 mb-4">
                                Your downloadable notes &amp; resources
                            </p>
                            <Link href="/dashboard/downloads">
                                <Button variant="outline" className="w-full">
                                    View All Downloads
                                </Button>
                            </Link>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
