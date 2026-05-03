"use client";

import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export type IntegrationStatus = "connected" | "disconnected" | "error";

interface Capability {
  icon: ReactNode;
  label: string;
}

interface Props {
  logo: ReactNode;
  name: string;
  tagline: string;
  capabilities: Capability[];
  status: IntegrationStatus;
  connectedAs?: string;
  connectHref?: string;
  onConfigure?: () => void;
}

export function IntegrationTile({
  logo,
  name,
  tagline,
  capabilities,
  status,
  connectedAs,
  connectHref,
  onConfigure,
}: Props) {
  const isConnected = status === "connected";

  return (
    <div className="rounded-xl border bg-card hover:border-foreground transition-colors flex flex-col">

      {/* Card header */}
      <div className="p-6 pb-4 flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
          {logo}
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <p className="font-semibold text-base leading-tight">{name}</p>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed line-clamp-2">{tagline}</p>
        </div>
      </div>

      {/* Capability chips */}
      <div className="px-6 pb-5 flex flex-wrap gap-2">
        {capabilities.map((cap, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted rounded-md px-2.5 py-1.5"
          >
            {cap.icon}
            {cap.label}
          </span>
        ))}
      </div>

      {/* Status + action footer */}
      <div className="mt-auto px-6 py-4 border-t border-border flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              status === "connected" ? "bg-green-500" :
              status === "error" ? "bg-red-500" :
              "bg-muted-foreground/40"
            }`}
          />
          <div className="min-w-0">
            <p className={`text-sm font-medium leading-tight ${
              status === "connected" ? "text-green-600" :
              status === "error" ? "text-red-500" :
              "text-muted-foreground"
            }`}>
              {status === "connected" ? "Connected" : status === "error" ? "Error" : "Not connected"}
            </p>
            {isConnected && connectedAs && (
              <p className="text-xs text-muted-foreground truncate max-w-[160px]" title={connectedAs}>
                {connectedAs}
              </p>
            )}
          </div>
        </div>

        {isConnected ? (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={onConfigure}
          >
            Configure <ArrowRight size={13} className="ml-1.5" />
          </Button>
        ) : (
          <Button size="sm" className="shrink-0" asChild>
            <a href={connectHref}>Connect</a>
          </Button>
        )}
      </div>
    </div>
  );
}
