import { Skeleton } from "@/components/ui/skeleton";

function IntegrationCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card flex flex-col">
      {/* Header: logo + name/tagline */}
      <div className="p-6 pb-4 flex items-start gap-4">
        <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
        <div className="flex-1 pt-0.5 space-y-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>

      {/* Capability chips */}
      <div className="px-6 pb-5 flex gap-2">
        <Skeleton className="h-7 w-24 rounded-md" />
        <Skeleton className="h-7 w-28 rounded-md" />
      </div>

      {/* Footer */}
      <div className="mt-auto px-6 py-4 border-t border-border flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
    </div>
  );
}

export default function IntegrationsLoading() {
  return (
    <div className="p-8 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-64" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <IntegrationCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
