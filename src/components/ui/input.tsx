import * as React from "react";

import { cn } from "@/lib/utils";

export function Input({ className, type = "text", ...props }: React.ComponentProps<"input">): React.JSX.Element {
  return (
    <input
      type={type}
      className={cn(
        "h-11 w-full rounded-md border border-line bg-surface px-3 text-base text-ink placeholder:text-muted",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
