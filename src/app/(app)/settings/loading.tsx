import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

function CardSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-border p-6 space-y-4">
      <Skeleton className="h-5 w-24" />
      <Separator />
      <div className="space-y-3">
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        ))}
      </div>
      <Skeleton className="h-8 w-20 rounded-lg" />
    </div>
  );
}

export default function SettingsLoading() {
  return (
    <div className="p-8 max-w-2xl space-y-6 animate-fade-in">
      <div className="space-y-1.5">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-4 w-44" />
      </div>

      {/* Account card */}
      <div className="rounded-xl border border-border p-6 space-y-4">
        <Skeleton className="h-5 w-20" />
        <Separator />
        <div className="space-y-1">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-40" />
        </div>
        <Separator />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>

      {/* Email card */}
      <CardSkeleton rows={2} />

      {/* Drive card */}
      <div className="rounded-xl border border-border p-6 space-y-4">
        <Skeleton className="h-5 w-28" />
        <Separator />
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
