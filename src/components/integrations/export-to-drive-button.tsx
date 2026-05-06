"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { HardDrive, ExternalLink, Trash2 } from "lucide-react";
import { exportInvoiceToDrive, removeFromDrive } from "@/actions/integrations";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function ExportToDriveButton({
  invoiceId,
  driveUrl: initialDriveUrl,
}: {
  invoiceId: string;
  driveUrl?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [driveUrl, setDriveUrl] = useState(initialDriveUrl ?? null);

  if (driveUrl) {
    return (
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" asChild>
          <a href={driveUrl} target="_blank" rel="noopener noreferrer">
            <HardDrive size={14} className="mr-2 text-green-600" />
            Open in Drive
            <ExternalLink size={11} className="ml-1.5 opacity-50" />
          </a>
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive px-2"
              disabled={removing}
            >
              <Trash2 size={14} />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove from Drive?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes the file from Google Drive. You can re-export it at any time.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  setRemoving(true);
                  try {
                    const { deleted } = await removeFromDrive("invoice", invoiceId);
                    setDriveUrl(null);
                    toast.success(deleted ? "Removed from Drive" : "Unlinked (file had no Drive ID)");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Remove failed");
                  } finally {
                    setRemoving(false);
                  }
                }}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
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
