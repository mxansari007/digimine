"use client";

/**
 * Labelled form input wrapper used throughout the onboarding flow.
 *
 * Why this exists: every onboarding form had its own inline mark-up for
 * label + input + optional error. Extracting it reduces JSX noise and
 * guarantees consistent focus/error/disabled states across teacher and
 * institute funnels.
 *
 *   <FormField label="Full name" required>
 *       <input className="field-input" ... />
 *   </FormField>
 *
 * Use `<FormField.Input/>` or pass any element as a child — the component
 * doesn't constrain what the actual control is. Useful when you want a
 * `<PhoneInput/>` from `react-international-phone` or a `<textarea/>`.
 */
import type { FC, ReactNode } from "react";

export interface FormFieldProps {
    label: string;
    /** Show a red asterisk after the label. Pure visual; validation happens elsewhere. */
    required?: boolean;
    /** Inline help text below the label (e.g. "comma separated"). */
    hint?: string;
    /** Validation error to surface below the input. Wired to aria-invalid on the wrapper. */
    error?: string | null;
    /** Visible only when the field is in a "success" state — useful after async validation. */
    success?: string | null;
    /** Input/textarea/custom control. */
    children: ReactNode;
    className?: string;
}

export const FormField: FC<FormFieldProps> = ({
    label,
    required,
    hint,
    error,
    success,
    children,
    className,
}) => {
    return (
        <div className={className} aria-invalid={!!error}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    {label}
                    {required && <span className="ml-1 text-rose-500">*</span>}
                </label>
                {hint && (
                    <span className="text-[11px] font-normal text-slate-400">{hint}</span>
                )}
            </div>
            {children}
            {error && (
                <p className="mt-1.5 flex items-start gap-1 text-xs text-rose-600">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
                        aria-hidden
                    >
                        <path
                            fillRule="evenodd"
                            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 011 1v3a1 1 0 11-2 0V8a1 1 0 011-1zm0 7a1 1 0 100 2 1 1 0 000-2z"
                            clipRule="evenodd"
                        />
                    </svg>
                    <span>{error}</span>
                </p>
            )}
            {success && !error && (
                <p className="mt-1.5 flex items-start gap-1 text-xs text-emerald-600">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
                        aria-hidden
                    >
                        <path
                            fillRule="evenodd"
                            d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42L8.5 12.08l6.79-6.79a1 1 0 011.414 0z"
                            clipRule="evenodd"
                        />
                    </svg>
                    <span>{success}</span>
                </p>
            )}
        </div>
    );
};

/**
 * Default text input class that pairs with the slate/blue look. Use as
 * `className={textInputClass}` on `<input>`/`<textarea>` controls inside
 * a FormField. Kept as a separate export rather than baked into FormField
 * so callers can compose freely.
 */
export const textInputClass =
    "w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm transition-all placeholder:text-slate-400 hover:border-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";
