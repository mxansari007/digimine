"use client";

import { useState, useEffect } from "react";
import { Button, Card } from "@digimine/ui";
import { getProductReviews, createFakeReview, deleteReview } from "@/lib/firestore/admin";
import type { Review } from "@digimine/types";

interface ReviewManagerProps {
    productId: string;
}

export function ReviewManager({ productId }: ReviewManagerProps) {
    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state
    const [authorName, setAuthorName] = useState("");
    const [rating, setRating] = useState(5);
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [reviewDate, setReviewDate] = useState("");

    useEffect(() => {
        loadReviews();
    }, [productId]);

    const loadReviews = async () => {
        setLoading(true);
        try {
            const data = await getProductReviews(productId);
            setReviews(data);
        } catch (error) {
            console.error("Error loading reviews:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!authorName.trim() || !title.trim() || !content.trim()) return;

        setIsSubmitting(true);
        try {
            const newReview = await createFakeReview({
                productId,
                authorName: authorName.trim(),
                rating,
                title: title.trim(),
                content: content.trim(),
                reviewDate: reviewDate ? new Date(reviewDate) : undefined,
            });
            setReviews([newReview, ...reviews]);
            setShowForm(false);
            resetForm();
        } catch (error) {
            console.error("Error creating review:", error);
            alert("Failed to create review");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (reviewId: string) => {
        if (!confirm("Delete this review?")) return;

        try {
            await deleteReview(reviewId);
            setReviews(reviews.filter(r => r.id !== reviewId));
        } catch (error) {
            console.error("Error deleting review:", error);
            alert("Failed to delete review");
        }
    };

    const resetForm = () => {
        setAuthorName("");
        setRating(5);
        setTitle("");
        setContent("");
        setReviewDate("");
    };

    const renderStars = (rating: number) => {
        return (
            <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                    <svg
                        key={star}
                        className={`w-4 h-4 ${star <= rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                    >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                ))}
            </div>
        );
    };

    return (
        <Card padding="lg">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Product Reviews</h3>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowForm(!showForm)}
                >
                    {showForm ? "Cancel" : "+ Add Review"}
                </Button>
            </div>

            {/* Add Review Form */}
            {showForm && (
                <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded-lg space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Reviewer Name
                            </label>
                            <input
                                type="text"
                                value={authorName}
                                onChange={(e) => setAuthorName(e.target.value)}
                                placeholder="John Doe"
                                required
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-100 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Rating
                            </label>
                            <div className="flex items-center gap-1">
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                        key={star}
                                        type="button"
                                        onClick={() => setRating(star)}
                                        className="p-1 hover:scale-110 transition-transform"
                                    >
                                        <svg
                                            className={`w-6 h-6 ${star <= rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`}
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                        >
                                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                        </svg>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Review Title
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Great product!"
                            required
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-100 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Review Content
                        </label>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Write a detailed review..."
                            rows={3}
                            required
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-100 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Review Date <span className="text-gray-400 font-normal">(optional - defaults to today)</span>
                        </label>
                        <input
                            type="date"
                            value={reviewDate}
                            onChange={(e) => setReviewDate(e.target.value)}
                            max={new Date().toISOString().split('T')[0]}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-100 outline-none"
                        />
                    </div>
                    <Button type="submit" variant="primary" isLoading={isSubmitting}>
                        Create Review
                    </Button>
                </form>
            )}

            {/* Reviews List */}
            {loading ? (
                <div className="text-center py-8 text-gray-500">Loading reviews...</div>
            ) : reviews.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                    No reviews yet. Add one to get started!
                </div>
            ) : (
                <div className="space-y-4">
                    {reviews.map((review) => (
                        <div key={review.id} className="p-4 border border-gray-200 rounded-lg">
                            <div className="flex items-start justify-between mb-2">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        {renderStars(review.rating)}
                                        <span className="font-medium text-gray-900">{review.authorName}</span>
                                        {review.isFake && (
                                            <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded">
                                                Admin
                                            </span>
                                        )}
                                        {review.isVerifiedPurchase && (
                                            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">
                                                Verified
                                            </span>
                                        )}
                                    </div>
                                    <h4 className="font-medium text-gray-900">{review.title}</h4>
                                </div>
                                <button
                                    onClick={() => handleDelete(review.id)}
                                    className="p-1 text-gray-400 hover:text-red-500"
                                    title="Delete review"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </div>
                            <p className="text-sm text-gray-600">{review.content}</p>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}
