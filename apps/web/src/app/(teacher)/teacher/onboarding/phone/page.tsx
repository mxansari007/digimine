import { redirect } from "next/navigation";

/**
 * The phone-OTP onboarding step was removed — email verification is the
 * only gate now. The route stays as a redirect so old links, bookmarks,
 * and user docs persisted mid-flow with onboardingStep="teacher:phone"
 * land on the surviving profile step instead of a 404.
 */
export default function PhoneOnboardingRemovedPage() {
    redirect("/teacher/onboarding/profile");
}
