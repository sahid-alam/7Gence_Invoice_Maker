"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { HardDrive } from "lucide-react";
import { exportReceiptToDrive } from "@/actions/integrations";

export function ExportToDriveButton({ receiptId }: { receiptId: string }) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const { url } = await exportReceiptToDrive(receiptId);
      toast.success(
        <span>
          Exported to Drive.{" "}
          <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
            Open file
          </a>
        </span>
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={loading}>
      <HardDrive size={14} className="mr-2" />
      {loading ? "Exporting…" : "Save to Drive"}
    </Button>
  );
}
