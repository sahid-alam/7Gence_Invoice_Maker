"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

interface Profile {
  id: string;
  display_name: string;
}

interface ProfileFilterProps {
  profiles: Profile[];
  selectedProfile?: string;
  basePath: string;
  extraParams?: Record<string, string | undefined>;
}

export function ProfileFilter({ profiles, selectedProfile, basePath, extraParams = {} }: ProfileFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (profiles.length <= 1) return null;

  function buildHref(profileId: string) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams)) {
      if (v) params.set(k, v);
    }
    if (profileId) params.set("profile", profileId);
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.push(buildHref(e.target.value));
  }

  const clearHref = (() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("profile");
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  })();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="profile-filter" className="text-sm text-muted-foreground whitespace-nowrap">
        Profile:
      </label>
      <select
        id="profile-filter"
        value={selectedProfile ?? ""}
        onChange={handleChange}
        className="text-sm border border-border rounded-md px-3 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">All profiles</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>{p.display_name}</option>
        ))}
      </select>
      {selectedProfile && (
        <Link href={clearHref} className="text-xs text-muted-foreground hover:text-foreground">
          Clear
        </Link>
      )}
    </div>
  );
}
