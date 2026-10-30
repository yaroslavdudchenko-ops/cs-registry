import * as React from "react";

import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string };

type SelectProps = Omit<React.ComponentProps<"select">, "onChange"> & {
  onValueChange?: (value: string) => void;
};

export function Select({ className, onValueChange, children, ...props }: SelectProps): React.JSX.Element {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-md border border-line bg-surface px-3 text-base text-ink",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      onChange={(event) => {
        onValueChange?.(event.target.value);
      }}
      {...props}
    >
      {children}
    </select>
  );
}
