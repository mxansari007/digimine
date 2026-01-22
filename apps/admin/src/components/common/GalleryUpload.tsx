"use client";

import { useState } from "react";
import { uploadFile } from "@/lib/firebase/storage";

interface GalleryUploadProps {
    label: string;
    path: string;
    images: string[];
    onImagesChange: (images: string[]) => void;
    maxImages?: number;
}

export function GalleryUpload({
    label,
    path,
    images,
    onImagesChange,
    maxImages = 6,
}: GalleryUploadProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        // Check max images limit
        if (images.length + files.length > maxImages) {
            setError(`Maximum ${maxImages} images allowed`);
            return;
        }

        setError(null);
        setIsUploading(true);
        setProgress(0);

        const file = files[0];
        const uploadPath = `${path}/${Date.now()}_${file.name}`;

        uploadFile(uploadPath, file, ({ progress, downloadUrl, error }) => {
            setProgress(progress);

            if (error) {
                setError(error.message);
                setIsUploading(false);
            }

            if (downloadUrl) {
                onImagesChange([...images, downloadUrl]);
                setIsUploading(false);
                setProgress(0);
            }
        });

        // Reset input
        e.target.value = "";
    };

    const removeImage = (index: number) => {
        const newImages = images.filter((_, i) => i !== index);
        onImagesChange(newImages);
    };

    const moveImage = (fromIndex: number, toIndex: number) => {
        if (toIndex < 0 || toIndex >= images.length) return;
        const newImages = [...images];
        const [removed] = newImages.splice(fromIndex, 1);
        newImages.splice(toIndex, 0, removed);
        onImagesChange(newImages);
    };

    return (
        <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">
                {label}
            </label>

            {/* Image Grid */}
            {images.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                    {images.map((url, index) => (
                        <div
                            key={url}
                            className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100 border-2 border-gray-200"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={url}
                                alt={`Gallery ${index + 1}`}
                                className="w-full h-full object-cover"
                            />

                            {/* Overlay controls */}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                {/* Move left */}
                                {index > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => moveImage(index, index - 1)}
                                        className="p-1.5 bg-white rounded-full text-gray-700 hover:bg-gray-100"
                                        title="Move left"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                        </svg>
                                    </button>
                                )}

                                {/* Remove */}
                                <button
                                    type="button"
                                    onClick={() => removeImage(index)}
                                    className="p-1.5 bg-red-500 rounded-full text-white hover:bg-red-600"
                                    title="Remove image"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>

                                {/* Move right */}
                                {index < images.length - 1 && (
                                    <button
                                        type="button"
                                        onClick={() => moveImage(index, index + 1)}
                                        className="p-1.5 bg-white rounded-full text-gray-700 hover:bg-gray-100"
                                        title="Move right"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                )}
                            </div>

                            {/* Index badge */}
                            {index === 0 && (
                                <span className="absolute top-2 left-2 px-2 py-0.5 bg-primary-600 text-white text-xs font-medium rounded">
                                    Main
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Upload Button */}
            {images.length < maxImages && (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-gray-50 hover:bg-gray-100 transition-colors">
                    {isUploading ? (
                        <div className="text-center">
                            <div className="flex justify-between text-xs text-gray-600 mb-1">
                                <span>Uploading...</span>
                                <span>{Math.round(progress)}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                    className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
                    ) : (
                        <label className="flex flex-col items-center cursor-pointer">
                            <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                            </svg>
                            <span className="text-sm font-medium text-primary-600">Add Image</span>
                            <span className="text-xs text-gray-500 mt-1">
                                {images.length}/{maxImages} images
                            </span>
                            <input
                                type="file"
                                className="sr-only"
                                accept="image/*"
                                onChange={handleFileChange}
                                disabled={isUploading}
                            />
                        </label>
                    )}
                </div>
            )}

            {error && (
                <p className="text-sm text-red-600 font-medium">{error}</p>
            )}
        </div>
    );
}
