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
  if (profiles.length <= 1) return null;

  function buildHref(profileId?: string) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams)) {
      if (v) params.set(k, v);
    }
    if (profileId) params.set("profile", profileId);
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Link
        href={buildHref()}
        className={`inline-flex items-center h-7 px-3 rounded-full text-xs font-medium transition-colors border ${
          !selectedProfile
            ? "bg-foreground text-background border-foreground"
            : "text-muted-foreground border-border hover:text-foreground hover:border-foreground/50"
        }`}
      >
        All profiles
      </Link>
      {profiles.map((p) => (
        <Link
          key={p.id}
          href={buildHref(p.id)}
          className={`inline-flex items-center h-7 px-3 rounded-full text-xs font-medium transition-colors border ${
            selectedProfile === p.id
              ? "bg-foreground text-background border-foreground"
              : "text-muted-foreground border-border hover:text-foreground hover:border-foreground/50"
          }`}
        >
          {p.display_name}
        </Link>
      ))}
    </div>
  );
}
