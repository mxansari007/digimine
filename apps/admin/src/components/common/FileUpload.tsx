"use client";

import { useState } from "react";
import { uploadFile } from "@/lib/firebase/storage";

interface FileUploadProps {
    label: string;
    path: string;
    onUploadComplete: (url: string) => void;
    accept?: string;
    existingUrl?: string;
}

export function FileUpload({
    label,
    path,
    onUploadComplete,
    accept = "*",
    existingUrl,
}: FileUploadProps) {
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [preview, setPreview] = useState<string | null>(existingUrl || null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Reset state
        setError(null);
        setProgress(0);
        setIsUploading(true);

        const uploadPath = `${path}/${Date.now()}_${file.name}`;

        uploadFile(
            uploadPath,
            file,
            ({ progress, downloadUrl, error }) => {
                setProgress(progress);

                if (error) {
                    setError(error.message);
                    setIsUploading(false);
                }

                if (downloadUrl) {
                    setPreview(downloadUrl);
                    onUploadComplete(downloadUrl);
                    setIsUploading(false);
                }
            }
        );
    };

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
                {label}
            </label>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 bg-gray-50 flex flex-col items-center justify-center text-center transition-colors hover:bg-gray-100">
                {preview ? (
                    <div className="relative w-full mb-4">
                        {/* If image, show preview */}
                        {accept.includes("image") ? (
                            <img src={preview} alt="Preview" className="h-32 mx-auto object-contain rounded-md" />
                        ) : (
                            <div className="text-sm text-gray-900 break-all font-medium bg-white p-2 rounded border">
                                File Uploaded: {preview.split('?')[0].split('/').pop()}
                            </div>
                        )}
                        <button
                            onClick={() => {
                                setPreview(null);
                                setProgress(0);
                            }}
                            type="button"
                            className="mt-2 text-xs text-red-600 hover:text-red-800 underline"
                        >
                            Remove / Change
                        </button>
                    </div>
                ) : (
                    <div className="space-y-1">
                        <svg
                            className="mx-auto h-12 w-12 text-gray-400"
                            stroke="currentColor"
                            fill="none"
                            viewBox="0 0 48 48"
                            aria-hidden="true"
                        >
                            <path
                                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                        <div className="flex text-sm text-gray-600 justify-center">
                            <label className="relative cursor-pointer bg-white rounded-md font-medium text-primary-600 hover:text-primary-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary-500">
                                <span>Upload a file</span>
                                <input
                                    type="file"
                                    className="sr-only"
                                    accept={accept}
                                    onChange={handleFileChange}
                                    disabled={isUploading}
                                />
                            </label>
                        </div>
                        <p className="text-xs text-gray-500">
                            {accept === "image/*" ? "PNG, JPG, GIF up to 5MB" : "Any file up to 50MB"}
                        </p>
                    </div>
                )}

                {isUploading && (
                    <div className="w-full mt-4">
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
                )}

                {error && (
                    <p className="mt-2 text-sm text-red-600 font-medium">
                        Error: {error}
                    </p>
                )}
            </div>
        </div>
    );
}
