"use client";

interface PlanUsageBarProps {
    label: string;
    current: number;
    max: number;
}

export function PlanUsageBar({ label, current, max }: PlanUsageBarProps) {
    const isUnlimited = max === -1;
    const percentage = isUnlimited ? 0 : Math.min(100, Math.round((current / max) * 100));
    const isNearLimit = !isUnlimited && percentage >= 80;
    const isOverLimit = !isUnlimited && current > max;

    return (
        <div>
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-slate-600">{label}</span>
                <span className={`text-sm font-medium ${isOverLimit ? "text-red-600" : isNearLimit ? "text-amber-700" : "text-slate-500"}`}>
                    {isUnlimited ? `${current} / Unlimited` : `${current} / ${max}`}
                </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/70">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${
                        isOverLimit
                            ? "bg-red-500/80"
                            : isNearLimit
                            ? "bg-amber-500/80"
                            : "bg-primary-400"
                    }`}
                    style={{ width: `${isUnlimited ? 0 : percentage}%` }}
                />
            </div>
        </div>
    );
}
