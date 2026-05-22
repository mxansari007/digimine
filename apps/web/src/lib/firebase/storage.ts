"use client";

import { ref, uploadBytesResumable, getDownloadURL, type UploadTask } from "firebase/storage";
import { storage } from "./client";

export interface UploadProgress {
    progress: number;
    downloadUrl?: string;
    error?: Error;
}

export function uploadFile(path: string, file: File, onProgress?: (status: UploadProgress) => void): UploadTask {
    const storageRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(storageRef, file);
    uploadTask.on("state_changed",
        (snapshot) => { if (onProgress) onProgress({ progress: (snapshot.bytesTransferred / snapshot.totalBytes) * 100 }); },
        (error) => { if (onProgress) onProgress({ progress: 0, error }); },
        async () => {
            try {
                const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                if (onProgress) onProgress({ progress: 100, downloadUrl });
            } catch (error) { if (onProgress) onProgress({ progress: 100, error: error as Error }); }
        }
    );
    return uploadTask;
}
