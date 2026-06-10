import { redirect } from "next/navigation";

/**
 * The phone-OTP onboarding step was removed — email verification is the
 * only gate now. The route stays as a redirect so old links, bookmarks,
 * and user docs persisted mid-flow with onboardingStep="institute:phone"
 * land on the institute setup step instead of a 404.
 */
export default function InstitutePhoneOnboardingRemovedPage() {
    redirect("/institute/onboarding");
}
