"use client";

/**
 * Compact GitHub-style activity heatmap.
 * Expects 90 (or any number of) daily buckets ordered oldest → newest.
 */
type Day = { date: string; count: number; avgPercentage: number | null };

export function ActivityHeatmap({ daily, label = "Activity (last 90 days)" }: { daily: Day[]; label?: string }) {
    const max = Math.max(1, ...daily.map((d) => d.count));
    const cellsByWeek: Day[][] = [];

    // Group by week, starting from the oldest. We want 7 rows × ~13 columns.
    let buf: Day[] = [];
    daily.forEach((d, i) => {
        buf.push(d);
        if (buf.length === 7 || i === daily.length - 1) {
            cellsByWeek.push(buf);
            buf = [];
        }
    });

    return (
        <div>
            <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
                <span className="text-xs text-gray-400">
                    {daily.reduce((s, d) => s + d.count, 0)} attempts
                </span>
            </div>
            <div className="mt-3 flex gap-1 overflow-x-auto">
                {cellsByWeek.map((week, w) => (
                    <div key={w} className="flex flex-col gap-1">
                        {week.map((d) => {
                            const intensity = d.count === 0 ? 0 : Math.min(4, Math.ceil((d.count / max) * 4));
                            const bg =
                                intensity === 0
                                    ? "bg-gray-100"
                                    : intensity === 1
                                    ? "bg-primary-200"
                                    : intensity === 2
                                    ? "bg-primary-400"
                                    : intensity === 3
                                    ? "bg-primary-600"
                                    : "bg-primary-800";
                            return (
                                <div
                                    key={d.date}
                                    title={`${d.date}: ${d.count} attempt${d.count === 1 ? "" : "s"}${
                                        d.avgPercentage !== null ? ` · avg ${d.avgPercentage}%` : ""
                                    }`}
                                    className={`h-3 w-3 rounded-sm ${bg}`}
                                />
                            );
                        })}
                    </div>
                ))}
            </div>
            <div className="mt-2 flex items-center gap-2 text-[10px] text-gray-400">
                <span>Less</span>
                <span className="h-3 w-3 rounded-sm bg-gray-100" />
                <span className="h-3 w-3 rounded-sm bg-primary-200" />
                <span className="h-3 w-3 rounded-sm bg-primary-400" />
                <span className="h-3 w-3 rounded-sm bg-primary-600" />
                <span className="h-3 w-3 rounded-sm bg-primary-800" />
                <span>More</span>
            </div>
        </div>
    );
}
