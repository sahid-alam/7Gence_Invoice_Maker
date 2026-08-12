import { Skeleton } from "@/components/ui/skeleton";

function TableRowSkeleton() {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
      <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
      <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
      <td className="px-4 py-3 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
      <td className="px-4 py-3"><Skeleton className="h-5 w-12 rounded-full" /></td>
    </tr>
  );
}

export default function DashboardLoading() {
  return (
    <div className="p-4 sm:p-8 space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-border p-5 space-y-3">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-9 w-10" />
          </div>
        ))}
      </div>

      {/* Recent invoices */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {["Invoice", "Client", "Date", "Amount", "Status"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left">
                    <Skeleton className="h-4 w-14" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...Array(5)].map((_, i) => <TableRowSkeleton key={i} />)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
