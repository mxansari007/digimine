"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@digimine/ui";
import {
    getProductReviews,
    getUserReview,
    hasUserPurchased,
    createReview,
    updateReview
} from "@/lib/firestore";
import { useAuthContext } from "@/contexts/AuthContext";
import type { Review } from "@digimine/types";

interface ReviewSectionProps {
    productId: string;
    isPurchaser?: boolean;
}

export function ReviewSection({ productId, isPurchaser }: ReviewSectionProps) {
    const { user, firebaseUser, isAuthenticated } = useAuthContext();
    const [reviews, setReviews] = useState<Review[]>([]);
    const [userReview, setUserReview] = useState<Review | null>(null);
    const [hasPurchased, setHasPurchased] = useState(false);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state
    const [rating, setRating] = useState(5);
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const formRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (showForm && formRef.current) {
            formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }, [showForm]);

    const loadReviews = async () => {
        try {
            const data = await getProductReviews(productId);
            setReviews(data);
        } catch (error) {
            console.error("Error loading reviews:", error);
        } finally {
            setLoading(false);
        }
    };

    const checkUserStatus = async () => {
        if (!firebaseUser) return;

        try {
            // If isPurchaser is passed, we only need to check for existing review
            if (typeof isPurchaser !== 'undefined') {
                setHasPurchased(isPurchaser);
                const existingReview = await getUserReview(productId, firebaseUser.uid);
                setUserReview(existingReview);

                if (existingReview) {
                    setRating(existingReview.rating);
                    setTitle(existingReview.title || "");
                    setContent(existingReview.content || "");
                }
            } else {
                // Otherwise check both
                const [purchased, existingReview] = await Promise.all([
                    hasUserPurchased(productId, firebaseUser.uid),
                    getUserReview(productId, firebaseUser.uid)
                ]);
                setHasPurchased(purchased);
                setUserReview(existingReview);

                if (existingReview) {
                    setRating(existingReview.rating);
                    setTitle(existingReview.title || "");
                    setContent(existingReview.content || "");
                }
            }
        } catch (error) {
            console.error("Error checking user status:", error);
        }
    };

    useEffect(() => {
        loadReviews();
    }, [productId]);

    useEffect(() => {
        if (typeof isPurchaser !== 'undefined') {
            setHasPurchased(isPurchaser);
        }
    }, [isPurchaser]);

    useEffect(() => {
        if (isAuthenticated && firebaseUser) {
            checkUserStatus();
        }
    }, [isAuthenticated, firebaseUser, productId, isPurchaser]);

    // We need to move the form population logic to a `useEffect` on `userReview` or keep it in the fetch function.
    // I'll rewrite checkUserStatus to handle data population correctly.



    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firebaseUser) return;

        setIsSubmitting(true);
        try {
            if (userReview) {
                // Update existing review
                await updateReview(userReview.id, { rating, title: title.trim(), content: content.trim() });
                setUserReview({ ...userReview, rating, title: title.trim(), content: content.trim() });
                // Refresh reviews list
                await loadReviews();
            } else {
                // Create new review
                const authorName = user?.firstName && user?.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : user?.displayName || firebaseUser.displayName || "Anonymous";
                const newReview = await createReview(
                    { productId, rating, title: title.trim(), content: content.trim() },
                    firebaseUser.uid,
                    authorName,
                    user?.email || firebaseUser.email || undefined
                );
                setUserReview(newReview);
                setReviews([newReview, ...reviews]);
            }
            setShowForm(false);
        } catch (error) {
            console.error("Error submitting review:", error);
            alert("Failed to submit review. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const averageRating = reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;

    const renderStars = (rating: number, size: "sm" | "md" | "lg" = "sm") => {
        const sizeClasses = { sm: "w-4 h-4", md: "w-5 h-5", lg: "w-6 h-6" };
        return (
            <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                    <svg
                        key={star}
                        className={`${sizeClasses[size]} ${star <= rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                    >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                ))}
            </div>
        );
    };

    const renderInteractiveStars = () => (
        <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="p-1 hover:scale-110 transition-transform"
                >
                    <svg
                        className={`w-8 h-8 ${star <= rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                    >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                </button>
            ))}
        </div>
    );

    const ratingCounts = [5, 4, 3, 2, 1].map(stars => ({
        stars,
        count: reviews.filter(r => r.rating === stars).length,
        percentage: reviews.length > 0
            ? (reviews.filter(r => r.rating === stars).length / reviews.length) * 100
            : 0
    }));

    return (
        <div className="container-page max-w-5xl mx-auto py-20 relative z-10">
            {/* Header Area */}
            <div className="mb-12">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
                    <div className="max-w-xl">
                        <span className="text-secondary-600 font-bold uppercase tracking-widest text-sm mb-2 block">Voices of Digital Miners</span>
                        <h2 className="text-3xl lg:text-5xl font-bold text-gray-900 font-display">Customer Reviews</h2>
                        <p className="mt-4 text-lg text-gray-500 font-medium">
                            Real experiences from people who are already building their digital future with this resource.
                        </p>
                    </div>

                    {isAuthenticated && hasPurchased && !showForm && (
                        <Button
                            variant={userReview ? "outline" : "primary"}
                            size="lg"
                            className="shadow-xl shadow-primary-500/20 hover:-translate-y-1 transition-all"
                            onClick={() => setShowForm(true)}
                        >
                            {userReview ? "Edit Your Review" : "Share Your Experience"}
                        </Button>
                    )}
                </div>

                {reviews.length > 0 && !showForm && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 bg-white p-8 lg:p-10 rounded-[2.5rem] border border-gray-100 shadow-xl shadow-gray-200/50">
                        {/* Average Score Card */}
                        <div className="flex flex-col items-center justify-center text-center lg:border-r border-gray-100 lg:pr-10">
                            <span className="text-7xl font-black text-gray-900 leading-none mb-4 tracking-tighter">
                                {averageRating.toFixed(1)}
                            </span>
                            <div className="mb-2">
                                {renderStars(Math.round(averageRating), "lg")}
                            </div>
                            <p className="text-sm text-gray-500 font-bold uppercase tracking-wider">
                                Based on {reviews.length} Verified Reviews
                            </p>
                        </div>

                        {/* Rating Breakdown */}
                        <div className="lg:col-span-2 space-y-3 flex flex-col justify-center">
                            {ratingCounts.map(({ stars, count, percentage }) => (
                                <div key={stars} className="flex items-center gap-4 group">
                                    <div className="flex items-center gap-1 w-12 shrink-0">
                                        <span className="text-sm font-bold text-gray-700">{stars}</span>
                                        <svg className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" viewBox="0 0 20 20">
                                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                        </svg>
                                    </div>
                                    <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary-500 rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(var(--primary-500),0.3)]"
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>
                                    <div className="w-12 text-right">
                                        <span className="text-sm font-bold text-gray-400 group-hover:text-primary-600 transition-colors">
                                            {count}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Review Form (Flashy Version) */}
            {showForm && (
                <div ref={formRef} className="mb-16 animate-fadeIn">
                    <form onSubmit={handleSubmit} className="bg-white border-2 border-primary-500/20 p-8 lg:p-12 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4">
                            <button
                                type="button"
                                onClick={() => setShowForm(false)}
                                className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-900 transition-all border border-gray-100"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="mb-10 text-center">
                            <h3 className="text-2xl font-bold text-gray-900 mb-2">Write Your Review</h3>
                            <p className="text-gray-500">How would you rate your experience with this pack?</p>
                        </div>

                        <div className="space-y-8 max-w-2xl mx-auto">
                            <div className="flex flex-col items-center gap-4 py-6 bg-gray-50 rounded-2xl">
                                <span className="text-sm font-bold text-gray-500 uppercase tracking-widest">Select Rating</span>
                                {renderInteractiveStars()}
                                <span className="text-lg font-bold text-primary-600">
                                    {rating === 5 ? "Perfect! ⭐⭐⭐⭐⭐" : rating === 4 ? "Great! ⭐⭐⭐⭐" : rating === 3 ? "Good ⭐⭐⭐" : rating === 2 ? "Could be better ⭐⭐" : "Poor ⭐"}
                                </span>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Headline</label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="Summarize your experience (optional)"
                                        className="w-full px-6 py-4 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-primary-500/20 outline-none text-lg font-medium placeholder:text-gray-300"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Detailed Review</label>
                                    <textarea
                                        value={content}
                                        onChange={(e) => setContent(e.target.value)}
                                        placeholder="What did you like? (optional)"
                                        rows={5}
                                        className="w-full px-6 py-4 bg-gray-50 border-0 rounded-2xl focus:ring-2 focus:ring-primary-500/20 outline-none text-lg leading-relaxed placeholder:text-gray-300"
                                    />
                                </div>
                            </div>

                            <Button
                                type="submit"
                                variant="primary"
                                className="w-full h-16 text-xl shadow-xl shadow-primary-500/30 font-bold"
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? "Saving..." : userReview ? "Update Product Review" : "Post Review Now"}
                            </Button>
                        </div>
                    </form>
                </div>
            )}

            {/* Empty State / Purchase Prompt */}
            {!loading && reviews.length === 0 && !showForm && (
                <div className="bg-white rounded-[2.5rem] p-16 text-center border border-gray-100 shadow-xl shadow-gray-200/50">
                    <div className="w-24 h-24 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-8 animate-bounce delay-700">
                        <svg className="w-12 h-12 text-yellow-400 fill-yellow-400" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                    </div>
                    <h3 className="text-3xl font-bold text-gray-900 mb-4">No reviews yet</h3>
                    <p className="text-xl text-gray-500 mb-10 max-w-md mx-auto leading-relaxed">
                        Be the pioneer! Share your thoughts and help others in the community make the right choice.
                    </p>
                    {isAuthenticated && hasPurchased && (
                        <Button
                            variant="primary"
                            size="lg"
                            className="px-10 h-14"
                            onClick={() => setShowForm(true)}
                        >
                            Be the First to Review
                        </Button>
                    )}
                    {isAuthenticated && !hasPurchased && (
                        <div className="inline-flex items-center gap-2 px-6 py-3 bg-blue-50 text-blue-700 rounded-full font-bold text-sm">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Purchase this product to leave a review
                        </div>
                    )}
                </div>
            )}

            {/* Actual Reviews List */}
            {reviews.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8">
                    {reviews.map((review) => (
                        <div key={review.id} className="bg-white p-8 rounded-3xl border border-gray-100 shadow-md hover:shadow-xl transition-all duration-300 flex flex-col group">
                            <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-50">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center font-bold text-primary-700">
                                        {review.authorName.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-gray-900 text-sm">{review.authorName}</span>
                                            {review.isVerifiedPurchase && (
                                                <div className="bg-green-100 text-green-700 p-0.5 rounded-full" title="Verified Purchase">
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                </div>
                                            )}
                                        </div>
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">
                                            {new Date(review.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    {renderStars(review.rating, "sm")}
                                </div>
                            </div>
                            {review.title && (
                                <h4 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-primary-600 transition-colors">
                                    {review.title}
                                </h4>
                            )}
                            {review.content && (
                                <p className="text-gray-600 leading-relaxed text-base flex-1">
                                    {review.content}
                                </p>
                            )}
                            {review.userId === firebaseUser?.uid && (
                                <div className="mt-6 pt-4 border-t border-gray-50 flex justify-end">
                                    <button
                                        onClick={() => {
                                            setRating(review.rating);
                                            setTitle(review.title || "");
                                            setContent(review.content || "");
                                            setShowForm(true);
                                        }}
                                        className="text-xs font-bold text-primary-600 hover:text-primary-700 flex items-center gap-1 uppercase tracking-widest"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                        Edit Entry
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
