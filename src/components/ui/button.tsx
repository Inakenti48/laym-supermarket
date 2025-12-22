import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.97]",
  {
    variants: {
      variant: {
        default: "bg-[hsl(0_0%_15%)] text-white hover:bg-[hsl(0_0%_25%)] shadow-lg hover:shadow-xl hover:-translate-y-0.5 rounded-xl",
        destructive: "bg-[hsl(0_0%_20%)] text-white hover:bg-[hsl(0_70%_45%)] shadow-lg hover:shadow-xl hover:-translate-y-0.5 rounded-xl",
        outline: "border-2 border-[hsl(0_0%_25%)] bg-[hsl(0_0%_20%)] text-white hover:bg-[hsl(0_0%_30%)] rounded-xl shadow-md hover:shadow-lg hover:-translate-y-0.5",
        secondary: "bg-[hsl(0_0%_25%)] text-white hover:bg-[hsl(0_0%_35%)] shadow-lg hover:shadow-xl hover:-translate-y-0.5 rounded-xl",
        ghost: "hover:bg-[hsl(0_0%_25%)] text-[hsl(0_0%_20%)] hover:text-white rounded-xl",
        link: "text-[hsl(0_0%_20%)] underline-offset-4 hover:underline",
        glass: "bg-[hsl(0_0%_20%/_0.9)] backdrop-blur-[20px] border border-[hsl(0_0%_30%)] text-white hover:bg-[hsl(0_0%_30%)] shadow-lg hover:shadow-xl hover:-translate-y-0.5 rounded-xl",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3",
        lg: "h-11 rounded-xl px-8",
        icon: "h-10 w-10 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
