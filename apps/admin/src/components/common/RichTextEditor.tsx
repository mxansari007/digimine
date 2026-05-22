"use client";

/**
 * Admin shim for the shared RichTextEditor.
 * Wires the admin's Firebase Storage instance automatically.
 */
import { RichTextEditor as SharedRichTextEditor } from "@digimine/shared";
import { storage } from "@/lib/firebase/client";
import type { RichTextEditorProps as SharedProps } from "@digimine/shared";

// Re-export the shared props type (minus storage which we inject)
type AdminRichTextEditorProps = Omit<SharedProps, "storage">;

export function RichTextEditor(props: AdminRichTextEditorProps) {
    return <SharedRichTextEditor {...props} storage={storage} />;
}
