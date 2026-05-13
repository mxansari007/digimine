"use client";

import { useState } from "react";
import type { ContentPreviewItem } from "@digimine/types";
import { Button } from "@digimine/ui";

interface ContentPreviewEditorProps {
    items: ContentPreviewItem[];
    onChange: (items: ContentPreviewItem[]) => void;
}

export function ContentPreviewEditor({ items, onChange }: ContentPreviewEditorProps) {
    const [newItemName, setNewItemName] = useState("");
    const [newItemType, setNewItemType] = useState<"file" | "folder">("file");

    const addItem = () => {
        if (!newItemName.trim()) return;

        const newItem: ContentPreviewItem = {
            id: Date.now().toString(),
            name: newItemName.trim(),
            type: newItemType,
            children: newItemType === "folder" ? [] : undefined,
        };

        onChange([...items, newItem]);
        setNewItemName("");
    };

    // Recursive function to update nested items
    const updateItemRecursive = (
        items: ContentPreviewItem[],
        targetId: string,
        updater: (item: ContentPreviewItem) => ContentPreviewItem | null
    ): ContentPreviewItem[] => {
        return items.reduce<ContentPreviewItem[]>((acc, item) => {
            if (item.id === targetId) {
                const updated = updater(item);
                if (updated) acc.push(updated);
                return acc;
            }
            if (item.type === "folder" && item.children) {
                acc.push({
                    ...item,
                    children: updateItemRecursive(item.children, targetId, updater),
                });
                return acc;
            }
            acc.push(item);
            return acc;
        }, []);
    };

    const removeItem = (id: string) => {
        onChange(updateItemRecursive(items, id, () => null));
    };

    const addChildToFolder = (folderId: string, childName: string, childType: "file" | "folder") => {
        if (!childName.trim()) return;

        const newChild: ContentPreviewItem = {
            id: Date.now().toString(),
            name: childName.trim(),
            type: childType,
            children: childType === "folder" ? [] : undefined,
        };

        onChange(updateItemRecursive(items, folderId, (item) => ({
            ...item,
            children: [...(item.children || []), newChild],
        })));
    };

    return (
        <div className="space-y-4">
            {/* Existing Items - Recursive rendering */}
            {items.length > 0 && (
                <div className="space-y-2">
                    {items.map((item) => (
                        <FolderTreeItem
                            key={item.id}
                            item={item}
                            depth={0}
                            onRemove={removeItem}
                            onAddChild={addChildToFolder}
                        />
                    ))}
                </div>
            )}

            {/* Add New Item */}
            <div className="flex gap-2">
                <select
                    value={newItemType}
                    onChange={(e) => setNewItemType(e.target.value as "file" | "folder")}
                    className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
                >
                    <option value="file">File</option>
                    <option value="folder">Folder</option>
                </select>
                <input
                    type="text"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder={`Add ${newItemType} name...`}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-100 outline-none"
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem())}
                />
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                    Add
                </Button>
            </div>

            {items.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                    No items added yet. Add files and folders to show customers what&apos;s included.
                </p>
            )}
        </div>
    );
}

// Recursive component for rendering folder tree items
interface FolderTreeItemProps {
    item: ContentPreviewItem;
    depth: number;
    onRemove: (id: string) => void;
    onAddChild: (folderId: string, name: string, type: "file" | "folder") => void;
}

function FolderTreeItem({ item, depth, onRemove, onAddChild }: FolderTreeItemProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [newChildName, setNewChildName] = useState("");
    const [newChildType, setNewChildType] = useState<"file" | "folder">("file");

    const handleAddChild = () => {
        if (newChildName.trim()) {
            onAddChild(item.id, newChildName.trim(), newChildType);
            setNewChildName("");
        }
    };

    return (
        <div
            className="border border-gray-200 rounded-lg overflow-hidden"
            style={{ marginLeft: depth > 0 ? 16 : 0 }}
        >
            {/* Item Header */}
            <div className="flex items-center justify-between p-3 bg-gray-50">
                <div className="flex items-center gap-2">
                    {item.type === "folder" && (
                        <button
                            type="button"
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="p-0.5 hover:bg-gray-200 rounded"
                        >
                            <svg
                                className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    )}
                    {item.type === "folder" ? (
                        <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                        </svg>
                    ) : (
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    )}
                    <span className="font-medium text-gray-900">{item.name}</span>
                    <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded">
                        {item.type}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="text-red-500 hover:text-red-600 p-1"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Folder Children (Recursive) */}
            {item.type === "folder" && isExpanded && (
                <div className="p-3 border-t border-gray-100 bg-white space-y-2">
                    {/* Render children recursively */}
                    {item.children && item.children.length > 0 && (
                        <div className="space-y-2">
                            {item.children.map((child) => (
                                <FolderTreeItem
                                    key={child.id}
                                    item={child}
                                    depth={depth + 1}
                                    onRemove={onRemove}
                                    onAddChild={onAddChild}
                                />
                            ))}
                        </div>
                    )}

                    {/* Add child input */}
                    <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100">
                        <select
                            value={newChildType}
                            onChange={(e) => setNewChildType(e.target.value as "file" | "folder")}
                            className="px-2 py-1 text-xs border border-gray-200 rounded bg-white"
                        >
                            <option value="file">File</option>
                            <option value="folder">Folder</option>
                        </select>
                        <input
                            type="text"
                            value={newChildName}
                            onChange={(e) => setNewChildName(e.target.value)}
                            placeholder={`Add ${newChildType}...`}
                            className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-primary-100 outline-none"
                            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddChild())}
                        />
                        <button
                            type="button"
                            onClick={handleAddChild}
                            className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
                        >
                            + Add
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
