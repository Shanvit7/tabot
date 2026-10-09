import * as SelectPrimitive from "@radix-ui/react-select";
import { Check } from "lucide-react";
import type * as React from "react";
import { cn } from "~/lib/utils";

export const SelectItem = ({
	className,
	children,
	...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) => (
	<SelectPrimitive.Item
		className={cn(
			"relative flex min-h-11 w-full cursor-default select-none items-center rounded px-3 py-2 pr-9 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-[#bfff00] data-[highlighted]:text-[#15251b]",
			className,
		)}
		{...props}
	>
		<SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
		<span className="absolute right-3 flex size-4 items-center justify-center">
			<SelectPrimitive.ItemIndicator>
				<Check aria-hidden="true" className="size-4" />
			</SelectPrimitive.ItemIndicator>
		</span>
	</SelectPrimitive.Item>
);
