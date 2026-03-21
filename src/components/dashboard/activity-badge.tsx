import { Badge } from "~/components/ui/badge";

const variants = {
  open: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  merged:
    "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  closed: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  approved: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  changes_requested: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  review_pending:
    "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  commit: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  review: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
} as const;

type ActivityBadgeVariant = keyof typeof variants;

export function ActivityBadge({ variant }: { variant: ActivityBadgeVariant }) {
  return (
    <Badge
      variant="outline"
      className={`border-0 text-[10px] font-normal ${variants[variant]}`}
    >
      {variant}
    </Badge>
  );
}
