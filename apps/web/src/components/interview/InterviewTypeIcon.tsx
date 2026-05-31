import { Code2, Database, BrainCircuit, Handshake, Network, type LucideIcon } from "lucide-react";
import { interviewTypeMeta, type InterviewType } from "@digimine/types";

/**
 * Maps the `iconName` stored on each interview-type's metadata to its
 * lucide-react component. Keeping the lookup here (in the web app) lets the
 * shared `@digimine/types` package stay React-free while the UI renders a
 * crisp icon instead of the old emoji.
 */
const ICON_BY_NAME: Record<string, LucideIcon> = {
    Code2,
    Database,
    BrainCircuit,
    Handshake,
    Network,
};

export function InterviewTypeIcon({
    type,
    className = "h-5 w-5",
}: {
    type: InterviewType;
    className?: string;
}) {
    const Icon = ICON_BY_NAME[interviewTypeMeta(type).iconName] ?? BrainCircuit;
    return <Icon className={className} aria-hidden />;
}
