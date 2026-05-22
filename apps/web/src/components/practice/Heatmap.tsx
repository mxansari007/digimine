"use client";

// GitHub-style contribution heatmap for practice activity.
const HEAT_CLASSES = ["bg-slate-100", "bg-emerald-200", "bg-emerald-400", "bg-emerald-600", "bg-emerald-800"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function heatLevel(c: number) {
    if (!c) return 0;
    if (c <= 1) return 1;
    if (c <= 3) return 2;
    if (c <= 6) return 3;
    return 4;
}

export function HeatmapLegend() {
    return (
        <div className="flex items-center justify-end gap-1.5 text-[10px] text-slate-400">
            <span>Less</span>
            {HEAT_CLASSES.map((c) => (
                <span key={c} className={`h-3 w-3 rounded-[3px] ${c}`} />
            ))}
            <span>More</span>
        </div>
    );
}

export default function Heatmap({ data }: { data: { date: string; count: number }[] }) {
    if (!data.length) return null;
    const firstWeekday = new Date(data[0].date + "T00:00:00").getDay(); // 0=Sun
    const cells: ({ date: string; count: number } | null)[] = [
        ...Array.from({ length: firstWeekday }, () => null),
        ...data,
    ];
    const weeks: ({ date: string; count: number } | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    return (
        <div className="overflow-x-auto pb-1">
            <div className="flex gap-[3px]">
                {weeks.map((week, wi) => {
                    const firstReal = week.find((c) => c);
                    const showMonth = firstReal && new Date(firstReal.date + "T00:00:00").getDate() <= 7;
                    const monthLabel = firstReal ? MONTHS[new Date(firstReal.date + "T00:00:00").getMonth()] : "";
                    return (
                        <div key={wi} className="flex flex-col gap-[3px]">
                            <span className="h-3 text-[9px] leading-3 text-slate-400">{showMonth ? monthLabel : ""}</span>
                            {week.map((c, di) =>
                                c ? (
                                    <span
                                        key={di}
                                        title={`${c.count} submission${c.count === 1 ? "" : "s"} on ${c.date}`}
                                        className={`h-3 w-3 rounded-[3px] ${HEAT_CLASSES[heatLevel(c.count)]} ring-1 ring-inset ring-black/[0.03]`}
                                    />
                                ) : (
                                    <span key={di} className="h-3 w-3" />
                                )
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
