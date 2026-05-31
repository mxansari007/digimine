"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { doc, getDoc, collection, getDocs, updateDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Button, Card, useToast } from "@digimine/ui";
import { type Order, type User } from "@digimine/types";
import { signUp, signInWithGoogle } from "@/lib/firebase/auth";
import { useAuthContext } from "@/contexts/AuthContext";
import { Timestamp } from "firebase/firestore";
import { DownloadIcon } from "@/components/icons/AppIcons";

interface ProductFile {
    id: string;
    name: string;
    url: string;
    productName: string;
}

export default function SuccessPage() {
    const searchParams = useSearchParams();
    const toast = useToast();
    const orderId = searchParams.get("orderId");
    const { firebaseUser, loading: authLoading } = useAuthContext();

    const [order, setOrder] = useState<Order | null>(null);
    const [files, setFiles] = useState<ProductFile[]>([]);
    const [loading, setLoading] = useState(true); // Start loading

    // Account creation state
    const [showAccountForm, setShowAccountForm] = useState(false);
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [password, setPassword] = useState("");
    const [isCreatingAccount, setIsCreatingAccount] = useState(false);
    const [accountError, setAccountError] = useState("");
    const [accountCreated, setAccountCreated] = useState(false);

    const [, setVerificationStatus] = useState<"verifying" | "success" | "failed" | "pending" | null>(null);
    const hasVerified = useRef(false);

    const [accessKeyInput, setAccessKeyInput] = useState("");
    const [accessKeyError, setAccessKeyError] = useState("");
    const [requiresVerification, setRequiresVerification] = useState(false);
    const [isVerifyingKey, setIsVerifyingKey] = useState(false);

    const verifyAccessKey = useCallback(async (key: string) => {
        setIsVerifyingKey(true);
        setAccessKeyError("");
        try {
            const res = await fetch("/api/orders/secure-access", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId, accessKey: key }),
            });
            const data = await res.json();
            if (data.success) {
                setOrder(data.order);
                setFiles(data.files);
                setRequiresVerification(false);
            } else {
                setAccessKeyError(data.error || "Invalid Access Key");
                setRequiresVerification(true);
            }
        } catch (err) {
            setAccessKeyError("Failed to verify key");
            setRequiresVerification(true);
        } finally {
            setIsVerifyingKey(false);
            setLoading(false);
        }
    }, [orderId]);

    // Initial check for key in URL
    useEffect(() => {
        const keyFromUrl = searchParams.get("accessKey");
        if (keyFromUrl && orderId) {
            verifyAccessKey(keyFromUrl);
        }
    }, [searchParams, orderId, verifyAccessKey]);

    // Main verification logic
    useEffect(() => {
        if (!orderId) {
            setLoading(false);
            return;
        }

        // Wait for auth to initialize before determining access
        if (authLoading) return;

        if (hasVerified.current) return;
        hasVerified.current = true;

        async function verifyAndFetchOrder() {
            try {
                // If verifying strictly "just paid", we'd have accessKey in URL which is handled above.


                // If user is guest (not logged in), require verification
                if (!firebaseUser) {
                    // Check if we have key in URL (handled by other effect usually, but verify here too)
                    const keyFromUrl = searchParams.get("accessKey");
                    if (keyFromUrl) {
                        await verifyAccessKey(keyFromUrl);
                        return;
                    }

                    console.log("Guest user without key, requiring verification");
                    setRequiresVerification(true);
                    setLoading(false);
                    return;
                }

                // If logged in, fetch from Firestore
                try {
                    const snap = await getDoc(doc(db, "orders", orderId!));
                    if (snap.exists()) {
                        const orderData = { id: snap.id, ...snap.data() } as Order;
                        if (orderData.userId === firebaseUser.uid) {
                            setOrder(orderData);
                            fetchFiles(orderData);
                        } else {
                            setRequiresVerification(true);
                        }
                    } else {
                        setRequiresVerification(true);
                    }
                } catch (e) {
                    setRequiresVerification(true);
                }

            } catch (err) {
                console.error("Error verifying/fetching order", err);
                setVerificationStatus("failed");
                setRequiresVerification(true);
            } finally {
                setLoading(false);
            }
        }

        // Only run if NOT handling URL key automatically to avoid double calls
        const keyFromUrl = searchParams.get("accessKey");
        if (!keyFromUrl) {
            verifyAndFetchOrder();
        }
    }, [orderId, authLoading, firebaseUser, searchParams, verifyAccessKey]);




    const handleKeySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await verifyAccessKey(accessKeyInput);
    };

    const fetchFiles = async (orderData: Order) => {
        const allFiles: ProductFile[] = [];
        for (const item of orderData.items) {
            // This also might fail if permission denied!
            // We need a secure way to get files too.
            // The secure-access API returns files.
            try {
                const filesSnap = await getDocs(collection(db, "products", item.productId, "files"));
                filesSnap.docs.forEach(fileDoc => {
                    allFiles.push({
                        id: fileDoc.id,
                        productName: item.productName,
                        ...fileDoc.data() as { name: string; url: string }
                    });
                });
            } catch (e) {
                // ignore
            }
        }
        setFiles(allFiles);
    };

    // Link order to user when authenticated
    const linkOrderToUser = useCallback(async () => {
        if (!firebaseUser || !order) return;

        try {
            // Update order with userId
            await updateDoc(doc(db, "orders", order.id), {
                userId: firebaseUser.uid,
                updatedAt: Timestamp.now()
            });

            // Update user's purchasedProducts
            const productIds = order.items.map(item => item.productId);
            const userRef = doc(db, "users", firebaseUser.uid);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const userData = userSnap.data();
                const existingProducts = userData.purchasedProducts || [];
                const newProducts = [...new Set([...existingProducts, ...productIds])];
                await updateDoc(userRef, {
                    purchasedProducts: newProducts,
                    updatedAt: Timestamp.now()
                });
            }
        } catch (err) {
            console.error("Error linking order to user:", err);
        }
    }, [firebaseUser, order]);

    // Link order to user when authenticated
    useEffect(() => {
        if (firebaseUser && order && !order.userId) {
            linkOrderToUser();
        }
    }, [firebaseUser, order, linkOrderToUser]);



    // Render Logic update
    if (loading) return <div className="p-20 text-center">Loading...</div>;

    if (requiresVerification && !order) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <Card padding="lg" className="max-w-md w-full text-center">
                    <div className="mb-6">
                        <div className="w-16 h-16 bg-blue-100 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11.5 14.5a10.5 10.5 0 01-9 9H3v-4l4.757-4.757a6 6 0 112.586-2.586z" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900">Verify Access</h2>
                        <p className="text-gray-600 mt-2 text-sm">
                            Please check your email for the <strong>Access Key</strong> sent with your receipt, or enter it below.
                        </p>
                    </div>

                    <form onSubmit={handleKeySubmit} className="space-y-4">
                        {accessKeyError && <div className="text-red-600 dark:text-red-300 text-sm bg-red-50 dark:bg-red-500/10 p-2 rounded">{accessKeyError}</div>}
                        <div className="text-left">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Access Key</label>
                            <input
                                type="text"
                                required
                                value={accessKeyInput}
                                onChange={(e) => setAccessKeyInput(e.target.value)}
                                placeholder="Paste your key here"
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                            />
                        </div>
                        <Button type="submit" variant="primary" className="w-full" isLoading={isVerifyingKey}>
                            Unlock Order
                        </Button>
                    </form>
                </Card>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-gray-900">Order not found</h1>
                    <Link href="/"><span className="text-primary-600 hover:underline mt-4 block">Return Home</span></Link>
                </div>
            </div>
        );
    }



    const handleCreateAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!order) return;

        setIsCreatingAccount(true);
        setAccountError("");

        try {
            // Create Firebase auth account
            const credential = await signUp(order.customerEmail, password, `${firstName} ${lastName}`);

            // Create Firestore user document
            const productIds = order.items.map(item => item.productId);
            const newUser: User = {
                id: credential.user.uid,
                email: order.customerEmail,
                displayName: `${firstName} ${lastName}`,
                firstName: firstName,
                lastName: lastName,
                phoneNumber: order.customerPhone || null,
                photoURL: null,
                role: "customer",
                purchasedProducts: productIds,
                purchasedTests: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            await setDoc(doc(db, "users", credential.user.uid), newUser);

            // Update order with userId
            await updateDoc(doc(db, "orders", order.id), {
                userId: credential.user.uid,
                updatedAt: Timestamp.now()
            });

            setAccountCreated(true);
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : "Failed to create account";
            setAccountError(errorMessage);
        } finally {
            setIsCreatingAccount(false);
        }
    };

    const handleGoogleSignUp = async () => {
        if (!order) return;

        setIsCreatingAccount(true);
        setAccountError("");

        try {
            const credential = await signInWithGoogle();

            // Check if user document exists
            const userRef = doc(db, "users", credential.user.uid);
            const userSnap = await getDoc(userRef);

            const productIds = order.items.map(item => item.productId);

            if (userSnap.exists()) {
                // Update existing user's purchasedProducts
                const userData = userSnap.data();
                const existingProducts = userData.purchasedProducts || [];
                const newProducts = [...new Set([...existingProducts, ...productIds])];
                await updateDoc(userRef, {
                    purchasedProducts: newProducts,
                    phoneNumber: userData.phoneNumber || order.customerPhone || null,
                    updatedAt: Timestamp.now()
                });
            } else {
                // Create new user document
                const nameParts = credential.user.displayName?.split(" ") || [];
                const newUser: User = {
                    id: credential.user.uid,
                    email: credential.user.email || order.customerEmail,
                    displayName: credential.user.displayName,
                    firstName: nameParts[0] || null,
                    lastName: nameParts.slice(1).join(" ") || null,
                    phoneNumber: order.customerPhone || null,
                    photoURL: credential.user.photoURL,
                    role: "customer",
                    purchasedProducts: productIds,
                    purchasedTests: [],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
                await setDoc(userRef, newUser);
            }

            // Update order with userId
            await updateDoc(doc(db, "orders", order.id), {
                userId: credential.user.uid,
                updatedAt: Timestamp.now()
            });

            setAccountCreated(true);
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : "Failed to sign in with Google";
            setAccountError(errorMessage);
        } finally {
            setIsCreatingAccount(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 py-12">
            <div className="container-page max-w-2xl">
                <Card padding="lg" className="text-center">
                    <div className="w-20 h-20 bg-green-100 dark:bg-green-500/15 text-green-600 dark:text-green-300 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>

                    <h1 className="font-display text-3xl font-bold text-gray-900 mb-2">
                        Thanks for your purchase!
                    </h1>

                    {/* Social Proof */}
                    <div className="flex flex-col items-center justify-center py-4 mb-2">
                        <div className="flex -space-x-3 mb-3 pl-3">
                            {[
                                "https://randomuser.me/api/portraits/men/32.jpg",
                                "https://randomuser.me/api/portraits/women/44.jpg",
                                "https://randomuser.me/api/portraits/men/86.jpg",
                                "https://randomuser.me/api/portraits/women/68.jpg",
                                "https://randomuser.me/api/portraits/men/46.jpg"
                            ].map((src, i) => (
                                <Image
                                    key={i}
                                    src={src}
                                    alt={`User ${i + 1}`}
                                    width={40}
                                    height={40}
                                    unoptimized
                                    className="rounded-full border-2 border-white object-cover bg-gray-200"
                                />
                            ))}
                            <div className="w-10 h-10 rounded-full border-2 border-white bg-gradient-to-br from-primary-600 to-accent-600 flex items-center justify-center text-xs font-bold text-white relative z-10">
                                +1k
                            </div>
                        </div>
                        <p className="text-sm text-gray-500">Join 10,000+ happy professionals</p>
                    </div>
                    <p className="text-gray-600 mb-8">
                        We&apos;ve sent a receipt to <span className="font-semibold text-gray-900">{order.customerEmail}</span>
                        {order.customerPhone && (
                            <> and <span className="font-semibold text-gray-900">{order.customerPhone}</span></>
                        )}
                    </p>

                    {/* Access Key Display */}
                    {searchParams.get("accessKey") && !firebaseUser && (
                        <div className="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/25 rounded-xl p-5 mb-8 text-left">
                            <div className="flex items-start gap-3">
                                <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-300 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <div className="flex-1">
                                    <h4 className="font-semibold text-yellow-900 dark:text-yellow-300 mb-1">Save your Access Key</h4>
                                    <p className="text-sm text-yellow-800 dark:text-yellow-300 mb-3">
                                        Please save this key in a safe place. You will need it to access these files in the future if you don&apos;t create an account.
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <code className="bg-white px-3 py-2 rounded-lg border border-yellow-300 dark:border-yellow-500/25 text-sm font-mono text-yellow-900 dark:text-yellow-300 flex-1 break-all">
                                            {searchParams.get("accessKey")}
                                        </code>
                                        <Button 
                                            size="sm" 
                                            variant="outline" 
                                            className="bg-white border-yellow-300 dark:border-yellow-500/25 text-yellow-800 dark:text-yellow-300 hover:bg-yellow-50 dark:hover:bg-yellow-500/10"
                                            onClick={() => {
                                                navigator.clipboard.writeText(searchParams.get("accessKey") || "");
                                                toast.success("Access key copied", {
                                                    description: "Paste it into the unlock form for any item.",
                                                });
                                            }}
                                        >
                                            Copy
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Your Downloads */}
                    <div className="bg-gray-50 rounded-xl p-6 mb-8 text-left">
                        <h3 className="font-semibold text-gray-900 mb-4">Your Downloads</h3>
                        <div className="space-y-3">
                            {files.length > 0 ? (
                                files.map((file) => (
                                    <div key={file.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-primary-100 dark:bg-primary-500/15 rounded flex items-center justify-center text-primary-600 dark:text-primary-300">
                                                <DownloadIcon className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <div className="font-medium text-gray-900">{file.name}</div>
                                                <div className="text-xs text-gray-500">{file.productName}</div>
                                            </div>
                                        </div>
                                        <a href={file.url} target="_blank" rel="noopener noreferrer">
                                            <Button size="sm" variant="primary">Download</Button>
                                        </a>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-4 text-gray-500">
                                    <p className="mb-2">Create an account below to access your files anytime.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Account Creation Section */}
                    {!firebaseUser && !accountCreated ? (
                        <div className="border-t border-gray-100 pt-8">
                            <h3 className="font-semibold text-gray-900 mb-2">Create Your Account</h3>
                            <p className="text-sm text-gray-500 mb-6">
                                Access your purchases anytime and leave reviews
                            </p>

                            {!showAccountForm ? (
                                <div className="space-y-3">
                                    <Button
                                        variant="primary"
                                        className="w-full"
                                        onClick={handleGoogleSignUp}
                                        isLoading={isCreatingAccount}
                                    >
                                        <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                                            <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                            <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                            <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                            <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                        </svg>
                                        Continue with Google
                                    </Button>
                                    <button
                                        onClick={() => setShowAccountForm(true)}
                                        className="text-sm text-primary-600 hover:underline"
                                    >
                                        Or create account with password
                                    </button>
                                </div>
                            ) : (
                                <form onSubmit={handleCreateAccount} className="space-y-4 text-left">
                                    {accountError && (
                                        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
                                            {accountError}
                                        </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                                            <input
                                                type="text"
                                                required
                                                value={firstName}
                                                onChange={(e) => setFirstName(e.target.value)}
                                                placeholder="John"
                                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-200 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                                            <input
                                                type="text"
                                                required
                                                value={lastName}
                                                onChange={(e) => setLastName(e.target.value)}
                                                placeholder="Doe"
                                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-200 outline-none"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                                        <input
                                            type="password"
                                            required
                                            minLength={6}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="At least 6 characters"
                                            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-200 outline-none"
                                        />
                                    </div>
                                    <div className="flex gap-3">
                                        <Button type="submit" variant="primary" className="flex-1" isLoading={isCreatingAccount}>
                                            Create Account
                                        </Button>
                                        <Button type="button" variant="outline" onClick={() => setShowAccountForm(false)}>
                                            Cancel
                                        </Button>
                                    </div>
                                </form>
                            )}
                        </div>
                    ) : accountCreated || firebaseUser ? (
                        <div className="border-t border-gray-100 pt-8">
                            <div className="flex items-center justify-center gap-2 text-green-600 mb-4">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="font-medium">Account ready!</span>
                            </div>
                            <p className="text-sm text-gray-500 mb-4">
                                You can now access your purchases and leave reviews anytime.
                            </p>
                            <Link href="/dashboard/profile">
                                <Button variant="primary">Go to My Profile</Button>
                            </Link>
                        </div>
                    ) : null}
                </Card>
            </div>
        </div>
    );
}
