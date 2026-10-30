import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-base font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-accent text-white hover:bg-accent-hover",
        outline: "border border-line bg-surface text-ink hover:bg-accent-soft",
        ghost: "text-ink hover:bg-accent-soft",
        danger: "bg-danger text-white hover:bg-danger/90",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-9 px-3 text-sm",
        wide: "h-11 px-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type = "button",
  ...props
}: ButtonProps): React.JSX.Element {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (asChild) {
    return <Slot data-slot="button" className={classes} {...props} />;
  }
  return <button data-slot="button" type={type} className={classes} {...props} />;
}
