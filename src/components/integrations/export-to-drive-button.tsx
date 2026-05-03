"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { HardDrive, ExternalLink } from "lucide-react";
import { exportInvoiceToDrive } from "@/actions/integrations";

export function ExportToDriveButton({
  invoiceId,
  driveUrl: initialDriveUrl,
}: {
  invoiceId: string;
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
      const { url } = await exportInvoiceToDrive(invoiceId);
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
