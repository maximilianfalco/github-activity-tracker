import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";

interface MetricCardProps {
  label: string;
  value: number;
  sub: string;
}

export function MetricCard({ label, value, sub }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-medium">{value}</p>
        <p className="text-[10px] text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

export function MetricCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <Skeleton className="mb-2 h-3 w-20" />
        <Skeleton className="mb-1 h-7 w-12" />
        <Skeleton className="h-2.5 w-24" />
      </CardContent>
    </Card>
  );
}
