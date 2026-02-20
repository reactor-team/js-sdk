"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface HeaderControlsProps {
  className?: string;
}

export function HeaderControls({ className }: HeaderControlsProps) {
  return (
    <header className={cn("flex items-center justify-between px-4 py-2 border-b border-border bg-card", className)}>
      {/* Left: Title */}
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-foreground">LiveCore</h1>
        <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded hidden sm:inline-block">
          Real-Time Video Generation
        </span>
      </div>

      {/* Right: Logo */}
      <div className="flex items-center">
        <Image
          src="/logo/symbol-night.svg"
          alt="Reactor Logo"
          width={36}
          height={24}
          className="opacity-90 dark:hidden"
        />
        <Image
          src="/logo/symbol-white.svg"
          alt="Reactor Logo"
          width={36}
          height={24}
          className="opacity-90 hidden dark:block"
        />
      </div>
    </header>
  );
}
