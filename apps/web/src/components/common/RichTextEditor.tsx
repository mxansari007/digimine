"use client";

/**
 * Web shim for the shared RichTextEditor.
 * Wires the web's Firebase Storage instance automatically.
 */
import { RichTextEditor as SharedRichTextEditor } from "@digimine/shared";
import { storage } from "@/lib/firebase/client";
import type { RichTextEditorProps as SharedProps } from "@digimine/shared";

type WebRichTextEditorProps = Omit<SharedProps, "storage">;

export function RichTextEditor(props: WebRichTextEditorProps) {
    return <SharedRichTextEditor {...props} storage={storage} />;
}
