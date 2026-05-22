"use client";

/**
 * Admin shim around the shared FileUpload. Wires the admin app's
 * Firebase Storage client so the rest of the admin codebase can keep
 * importing `FileUpload` from `@/components/common/FileUpload` without
 * being aware of the shared package.
 */
import { FileUpload as SharedFileUpload } from "@digimine/shared";
import { storage } from "@/lib/firebase/client";

type SharedFileUploadProps = React.ComponentProps<typeof SharedFileUpload>;
type Props = Omit<SharedFileUploadProps, "storage">;

export function FileUpload(props: Props) {
    return <SharedFileUpload {...props} storage={storage} />;
}
