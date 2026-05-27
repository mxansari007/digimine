/**
 * Shared building blocks for the onboarding flows. Every onboarding page
 * (teacher: phone/payment/profile; institute: phone/wizard) composes from
 * these so the visual language stays in lockstep across funnels.
 */
export { OnboardingShell } from "./OnboardingShell";
export type { OnboardingShellProps } from "./OnboardingShell";

export { Stepper } from "./Stepper";
export type { StepperProps } from "./Stepper";

export { StepHeader } from "./StepHeader";
export type { StepHeaderProps } from "./StepHeader";

export { FormField, textInputClass } from "./FormField";
export type { FormFieldProps } from "./FormField";
