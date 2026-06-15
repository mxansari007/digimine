/**
 * React-Native file upload to Cloud Storage.
 *
 * Expo gives us a local `file://` (or `content://`) URI from the document /
 * image picker; the Firebase JS SDK wants a Blob. We fetch the URI to get a
 * Blob, then stream it up with a resumable task so the UI can show progress.
 * Returns the public download URL the resources API records.
 */
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { storage } from "./firebase";

/** Build the per-class, per-user object path the storage rules expect. */
export function resourceStoragePath(classId: string, uid: string, fileName: string): string {
  const safe = (fileName || "file")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-80) || "file";
  return `classResources/${classId}/${uid}/${Date.now()}-${safe}`;
}

export interface UploadResult {
  url: string;
  path: string;
}

/**
 * Upload a local file to `path`. `onProgress` gets a 0–1 fraction. The
 * returned promise resolves with the download URL + the storage path (the
 * path is needed so the server can delete the object later).
 */
export async function uploadFile(
  localUri: string,
  path: string,
  contentType: string,
  onProgress?: (fraction: number) => void
): Promise<UploadResult> {
  const resp = await fetch(localUri);
  const blob = await resp.blob();
  const task = uploadBytesResumable(ref(storage, path), blob, { contentType });

  return new Promise<UploadResult>((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => {
        if (onProgress && snap.totalBytes > 0) {
          onProgress(snap.bytesTransferred / snap.totalBytes);
        }
      },
      reject,
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve({ url, path });
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}
