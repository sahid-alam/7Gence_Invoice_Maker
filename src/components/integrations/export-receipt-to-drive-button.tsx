"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { HardDrive, ExternalLink } from "lucide-react";
import { exportReceiptToDrive } from "@/actions/integrations";

export function ExportReceiptToDriveButton({
  receiptId,
  driveUrl: initialDriveUrl,
}: {
  receiptId: string;
  driveUrl?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [driveUrl, setDriveUrl] = useState(initialDriveUrl ?? null);

  if (driveUrl) {
    return (
      <Button variant="outline" size="sm" asChild>
        <a href={driveUrl} target="_blank" rel="noopener noreferrer">
          <HardDrive size={14} className="mr-2 text-green-600" />
          Open in Drive
          <ExternalLink size={11} className="ml-1.5 opacity-50" />
        </a>
      </Button>
    );
  }

  async function handleExport() {
    setLoading(true);
    try {
      const { url } = await exportReceiptToDrive(receiptId);
      setDriveUrl(url);
      toast.success("Saved to Drive");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={loading}>
      <HardDrive size={14} className="mr-2" />
      {loading ? "Saving…" : "Save to Drive"}
    </Button>
  );
}
