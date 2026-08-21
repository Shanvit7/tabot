import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "~/lib/utils";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap font-bold uppercase tracking-wide border-2 border-black disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2",
	{
		variants: {
			variant: {
				default:
					"bg-lime text-black shadow-hard hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-none active:translate-x-[4px] active:translate-y-[4px] active:shadow-none",
				secondary:
					"bg-black text-lime shadow-hard hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-none active:translate-x-[4px] active:translate-y-[4px] active:shadow-none",
				outline:
					"bg-white text-black shadow-hard hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-none hover:bg-lime active:translate-x-[4px] active:translate-y-[4px] active:shadow-none",
				destructive:
					"bg-destructive text-white shadow-hard hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-none active:translate-x-[4px] active:translate-y-[4px] active:shadow-none",
				ghost:
					"border-transparent shadow-none hover:bg-lime/10 hover:border-black",
				link: "border-transparent shadow-none underline-offset-4 hover:underline text-black",
			},
			size: {
				default: "h-11 px-5 py-2",
				sm: "h-9 px-4 text-xs",
				lg: "h-12 px-8 text-base",
				xl: "h-14 px-10 text-lg",
				icon: "h-11 w-11",
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
		return (
			<Comp
				className={cn(buttonVariants({ variant, size, className }))}
				ref={ref}
				{...props}
			/>
		);
	},
);
Button.displayName = "Button";

export { Button, buttonVariants };
