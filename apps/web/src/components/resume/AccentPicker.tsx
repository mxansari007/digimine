"use client";

/** Accent colour picker: preset swatches + a "pick your own" custom colour. */
import { RESUME_ACCENT_COLORS } from "@digimine/types";

interface Props {
    value: string;
    onChange: (color: string) => void;
}

export default function AccentPicker({ value, onChange }: Props) {
    const isPreset = (RESUME_ACCENT_COLORS as readonly string[]).includes(value.toLowerCase());

    return (
        <div className="flex items-center gap-2">
            {RESUME_ACCENT_COLORS.map((col) => {
                const active = value.toLowerCase() === col;
                return (
                    <button
                        key={col}
                        type="button"
                        onClick={() => onChange(col)}
                        aria-label={`Accent ${col}`}
                        className={`h-6 w-6 rounded-full ring-2 ring-offset-2 ring-offset-white transition dark:ring-offset-slate-900 ${
                            active ? "ring-slate-900 dark:ring-white" : "ring-transparent hover:ring-slate-300"
                        }`}
                        style={{ backgroundColor: col }}
                    />
                );
            })}

            {/* Custom colour — the native picker is layered transparently on top */}
            <div className="relative h-6 w-6" title="Pick your own colour">
                <div
                    className={`grid h-6 w-6 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-white transition dark:ring-offset-slate-900 ${
                        !isPreset ? "ring-slate-900 dark:ring-white" : "ring-transparent"
                    }`}
                    style={
                        !isPreset
                            ? { backgroundColor: value }
                            : { background: "conic-gradient(from 0deg, #f87171, #fbbf24, #34d399, #22d3ee, #60a5fa, #c084fc, #f87171)" }
                    }
                >
                    {isPreset && (
                        <svg className="h-3.5 w-3.5 text-white drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                    )}
                </div>
                <input
                    type="color"
                    aria-label="Pick a custom accent colour"
                    value={isPreset ? "#0f172a" : value}
                    onChange={(e) => onChange(e.target.value)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
            </div>
        </div>
    );
}
