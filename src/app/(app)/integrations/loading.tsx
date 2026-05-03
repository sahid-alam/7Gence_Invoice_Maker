import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

export default function IntegrationsLoading() {
  return (
    <div className="p-8 max-w-2xl space-y-6 animate-fade-in">
      <div className="space-y-1.5">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-44" />
      </div>
      <div className="rounded-xl border border-border p-6 space-y-4">
        <Skeleton className="h-5 w-20" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Separator />
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>
    </div>
  );
}
