"use client";

/**
 * Admin shim around the shared ImageInput. Wires the admin app's Firebase
 * Storage client so call sites can keep importing from this path without
 * being aware of the shared package.
 *
 * Imports the prop type explicitly (rather than deriving via
 * React.ComponentProps) so type resolution doesn't depend on whatever
 * incremental cache TypeScript has lying around.
 */
import { ImageInput as SharedImageInput, type ImageInputProps } from "@digimine/shared";
import { storage } from "@/lib/firebase/client";

type Props = Omit<ImageInputProps, "storage">;

export function ImageInput(props: Props) {
    return <SharedImageInput {...props} storage={storage} />;
}
