import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 backdrop-blur-sm",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/90 text-primary-foreground shadow-button hover:bg-primary hover:shadow-button-hover",
        secondary: "border-transparent bg-secondary/90 text-secondary-foreground shadow-sm hover:bg-secondary",
        destructive: "border-transparent bg-destructive/90 text-destructive-foreground shadow-sm hover:bg-destructive",
        outline: "text-foreground bg-background/50 border-border/50",
        glass: "border-border/30 bg-background/60 backdrop-blur-[12px] text-foreground shadow-glass",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
