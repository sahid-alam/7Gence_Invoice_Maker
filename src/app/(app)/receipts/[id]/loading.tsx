import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

export default function ReceiptDetailLoading() {
  return (
    <div className="p-4 sm:p-8 max-w-3xl space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-6 w-28" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-32 rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
      </div>

      <Separator />

      <div className="rounded-lg border border-border p-8 space-y-6 bg-card">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="space-y-1 items-end flex flex-col">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-24" />
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-8">
          <div className="space-y-2">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-36" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>

        <Separator />

        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="items-end flex flex-col space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-4 w-10" />
          </div>
        </div>
      </div>
    </div>
  );
}
