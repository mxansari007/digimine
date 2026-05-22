/**
 * Re-export of the shared brand logo. Kept here so existing imports from
 * `@/components/common/Logo` keep resolving — the canonical implementation
 * now lives in `@digimine/ui` so both web and admin render the same mark.
 */
export { Logo, type LogoProps } from "@digimine/ui";
