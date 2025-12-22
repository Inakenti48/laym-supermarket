import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-xl border border-[hsl(0_0%_0%)] bg-[hsl(0_0%_0%)] px-4 py-2 text-base text-white placeholder:text-white/70 ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(0_0%_20%)] focus-visible:ring-offset-0 focus-visible:border-[hsl(0_0%_20%)] focus-visible:bg-[hsl(0_0%_10%)] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-all duration-300 shadow-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
