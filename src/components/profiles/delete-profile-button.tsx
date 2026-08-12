"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";
import { deleteProfile } from "@/actions/profiles";

/**
 * Sits OUTSIDE the profile edit form on purpose.
 *
 * This used to be a <form> nested inside the edit <form>. HTML forbids that, so the
 * browser drops the inner one while parsing; server and client markup then diverge,
 * hydration fails, and the button silently does nothing. A dialog with an action
 * call has no nested form at all.
 */
export function DeleteProfileButton({
  profileId,
  profileName,
}: {
  profileId: string;
  profileName: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      await deleteProfile(profileId);
    } catch (err) {
      // Server refuses when invoices still point at this profile — surface that
      // sentence rather than a generic failure, since it says what to do next.
      toast.error(err instanceof Error ? err.message : "Delete failed");
      setLoading(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={loading}
        >
          <Trash2 size={14} className="mr-1" />
          {loading ? "Deleting…" : "Delete Profile"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this sender identity?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium text-foreground">{profileName}</span> and its
            payment methods will be permanently removed. Its invoice numbering is gone
            too, so a future profile with the same prefix starts counting again from one.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
