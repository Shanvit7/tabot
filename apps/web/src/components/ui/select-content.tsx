import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown, ChevronUp } from "lucide-react";
import type * as React from "react";
import { cn } from "~/lib/utils";

export const SelectContent = ({
	className,
	children,
	position = "popper",
	...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) => (
	<SelectPrimitive.Portal>
		<SelectPrimitive.Content
			className={cn(
				"z-50 max-h-[min(var(--radix-select-content-available-height),24rem)] w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-[#2f4738] bg-[#101c16] text-[#e8f3e8] shadow-xl",
				className,
			)}
			position={position}
			{...props}
		>
			<SelectPrimitive.ScrollUpButton className="flex cursor-default items-center justify-center py-1">
				<ChevronUp aria-hidden="true" className="size-4" />
			</SelectPrimitive.ScrollUpButton>
			<SelectPrimitive.Viewport className="p-1">
				{children}
			</SelectPrimitive.Viewport>
			<SelectPrimitive.ScrollDownButton className="flex cursor-default items-center justify-center py-1">
				<ChevronDown aria-hidden="true" className="size-4" />
			</SelectPrimitive.ScrollDownButton>
		</SelectPrimitive.Content>
	</SelectPrimitive.Portal>
);
