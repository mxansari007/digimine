"use client";

import {
    ref,
    uploadBytesResumable,
    getDownloadURL,
    type FirebaseStorage,
    type UploadTask,
} from "firebase/storage";

export interface UploadProgress {
    progress: number;
    downloadUrl?: string;
    error?: Error;
}

/**
 * Upload a file to Firebase Storage. The storage instance is passed in
 * explicitly so this helper has no dependency on any specific app's
 * Firebase client.
 */
export function uploadFile(
    storage: FirebaseStorage,
    path: string,
    file: File,
    onProgress?: (status: UploadProgress) => void
): UploadTask {
    const storageRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
        "state_changed",
        (snapshot) => {
            const progress =
                (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            if (onProgress) onProgress({ progress });
        },
        (error) => {
            console.error("Upload error:", error);
            if (onProgress) onProgress({ progress: 0, error });
        },
        async () => {
            try {
                const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                if (onProgress) onProgress({ progress: 100, downloadUrl });
            } catch (error) {
                console.error("Error getting download URL:", error);
                if (onProgress) onProgress({ progress: 100, error: error as Error });
            }
        }
    );

    return uploadTask;
}
