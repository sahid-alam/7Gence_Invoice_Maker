"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

export function FlashToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const saved = searchParams.get("saved");

  useEffect(() => {
    if (!saved) return;
    toast.success(saved);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("saved");
    const qs = params.toString();
    router.replace(window.location.pathname + (qs ? `?${qs}` : ""), { scroll: false });
  }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
