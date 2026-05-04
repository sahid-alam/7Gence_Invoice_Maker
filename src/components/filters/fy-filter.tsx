"use client";

import { useRouter } from "next/navigation";
import { getFYConfig, getFYLabel, getRecentFYStartYears } from "@/lib/financial-year";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FYFilterProps {
  countryCode?: string | null;
  selectedFY?: string;
  basePath: string;
  extraParams?: Record<string, string | undefined>;
}

export function FYFilter({ countryCode, selectedFY, basePath, extraParams = {} }: FYFilterProps) {
  const router = useRouter();
  const config = getFYConfig(countryCode);
  const years = getRecentFYStartYears(config, 4);

  function buildHref(fy?: string) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams)) {
      if (v) params.set(k, v);
    }
    if (fy) params.set("fy", fy);
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  }

  function handleChange(value: string) {
    router.push(buildHref(value === "all" ? undefined : value));
  }

  return (
    <Select value={selectedFY ?? "all"} onValueChange={handleChange}>
      <SelectTrigger className="h-8 w-[140px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All time</SelectItem>
        {years.map((y) => (
          <SelectItem key={y} value={String(y)}>
            {getFYLabel(y, config)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
