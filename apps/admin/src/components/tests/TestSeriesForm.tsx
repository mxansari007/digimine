"use client";

import { TestSeriesForm as SharedTestSeriesForm } from "@digimine/shared";
import type { CreateTestSeriesInput } from "@digimine/types";
import { storage } from "@/lib/firebase/client";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { createTestSeries } from "@/lib/firestore/tests";

interface AdminTestSeriesFormProps {
    onCancelPath?: string;
}

export function TestSeriesForm({ onCancelPath = "/tests" }: AdminTestSeriesFormProps) {
    const { user } = useAdminAuth();

    const handleSubmit = async (
        payload: CreateTestSeriesInput,
        onSuccess: () => void,
    ) => {
        if (!user) throw new Error("Admin not authenticated");
        await createTestSeries(payload, user.id);
        onSuccess();
    };

    return (
        <SharedTestSeriesForm
            actingUserId={user?.id || ""}
            storage={storage}
            onSubmit={handleSubmit}
            onCancelPath={onCancelPath}
        />
    );
}
