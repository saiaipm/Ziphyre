import { Badge } from "@/components/ui/badge";

/**
 * FR-138/§10B — always shown wherever a sample posting appears, and
 * never itself a setting. Amber rather than the closed badge's red or
 * the accent token: not a status about the posting (open/closed
 * already owns that colour), a fact about its origin.
 */
export function SampleBadge() {
  return (
    <Badge
      variant="secondary"
      className="rounded-full bg-fit-review-bg px-2 py-0 text-[11px] font-medium text-fit-review"
    >
      Sample
    </Badge>
  );
}
