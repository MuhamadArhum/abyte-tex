import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const POSITIVE = new Set(["ACTIVE", "COMPLETED", "APPROVED", "PASS", "PAID", "DELIVERED", "ACCEPTED"]);
const NEGATIVE = new Set(["INACTIVE", "BLOCKED", "LOCKED", "REJECTED", "CANCELLED", "BREAKDOWN", "REJECT"]);
const NEUTRAL_WARN = new Set(["INVITED", "PENDING_APPROVAL", "DRAFT", "HOLD", "MAINTENANCE", "PENDING_QC"]);

export function StatusBadge({ status }: { status: string }) {
  const variantClass = POSITIVE.has(status)
    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
    : NEGATIVE.has(status)
      ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
      : NEUTRAL_WARN.has(status)
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
        : "bg-secondary text-secondary-foreground";

  return (
    <Badge variant="outline" className={cn("border-0 font-medium", variantClass)}>
      {status.replaceAll("_", " ")}
    </Badge>
  );
}
