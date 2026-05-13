"use client";

import Link from "next/link";
import Image from "next/image";
import { type Product } from "@digimine/types";
import { formatCurrency } from "@digimine/utils";

interface ProductCardProps {
    product: Product;
    rating?: number;
    reviewCount?: number;
    isOwned?: boolean;
    isSubscribed?: boolean;
}

export function ProductCard({ product, rating, reviewCount, isOwned, isSubscribed }: ProductCardProps) {
    const hasDiscount = product.compareAtPrice && product.compareAtPrice > product.price;

    return (
        <Link href={`/products/${product.slug}`} className="group h-full block">
            <article className="h-full flex flex-col bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ease-out will-change-transform">
                {/* Image Container */}
                <div className="relative aspect-[4/3] bg-gray-100 overflow-hidden">
                    {product.thumbnailURL ? (
                        <Image
                            src={product.thumbnailURL}
                            alt={product.name}
                            fill
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            className="object-cover transform group-hover:scale-105 transition-transform duration-500 ease-out"
                        />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-300 bg-gray-50">
                            <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </div>
                    )}

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                    {/* Badges Container - Top Right Stacking */}
                    <div className="absolute top-2 right-2 flex flex-col items-end gap-1 z-10">
                        {isOwned && (
                            <div className="bg-green-500 text-white px-2 py-0.5 rounded-full text-[9px] font-bold uppercase flex items-center gap-1 shadow-md">
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                                Owned
                            </div>
                        )}
                        {isSubscribed && (
                            <div className="bg-blue-500 text-white px-2 py-0.5 rounded-full text-[9px] font-bold uppercase flex items-center gap-1 shadow-md">
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                                Subscribed
                            </div>
                        )}
                        {hasDiscount && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-white/95 backdrop-blur-md text-red-600 text-[8px] font-black uppercase tracking-tighter shadow-sm border border-red-100">
                                SALE
                            </span>
                        )}
                        {product.instantAccess && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-green-600/90 backdrop-blur-md text-white text-[8px] font-black uppercase tracking-tighter shadow-sm">
                                INSTANT
                            </span>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="p-3 md:p-5 flex-1 flex flex-col">
                    {/* Category - Hidden on mobile */}
                    <div className="mb-1 hidden md:block">
                        <span className="inline-block text-[10px] font-bold tracking-widest text-primary-600 uppercase bg-primary-50 px-2 py-1 rounded-md">
                            {product.type}
                        </span>
                    </div>

                    {/* Title */}
                    <h3 className="font-display text-sm md:text-base font-semibold text-slate-900 mb-1 line-clamp-2 group-hover:text-primary-600 transition-colors" style={{ lineHeight: '1.3', letterSpacing: '-0.01em' }}>
                        {product.name}
                    </h3>

                    {/* Rating */}
                    {reviewCount !== undefined && reviewCount > 0 && (
                        <div className="flex items-center gap-1 mb-2">
                            <div className="flex items-center">
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <svg
                                        key={star}
                                        className={`w-3 h-3 ${rating && star <= Math.round(rating) ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`}
                                        viewBox="0 0 20 20"
                                        fill="currentColor"
                                    >
                                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                    </svg>
                                ))}
                            </div>
                            <span className="text-[10px] md:text-xs text-slate-400">({reviewCount})</span>
                        </div>
                    )}


                    {/* Description */}
                    <p className="text-xs text-slate-400 line-clamp-2 mb-3" style={{ lineHeight: '1.6' }}>
                        {product.shortDescription || "Premium digital resource."}
                    </p>


                    {/* Footer: Price & Action */}
                    <div className="flex items-center justify-between pt-2 md:pt-4 border-t border-gray-50 mt-auto">
                        <div className="flex items-baseline gap-1.5 md:gap-2">
                            <span className="font-display text-lg md:text-xl font-bold text-gray-900">
                                {formatCurrency(product.price)}
                            </span>
                            {hasDiscount && (
                                <span className="textxs md:text-xs text-gray-400 line-through font-medium">
                                    {formatCurrency(product.compareAtPrice!)}
                                </span>
                            )}
                        </div>
                        <span className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center transform group-hover:translate-x-1 group-hover:bg-primary-100 transition-all duration-300">
                            <svg className="w-3 h-3 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </span>
                    </div>
                </div>
            </article>
        </Link>
    );
}
