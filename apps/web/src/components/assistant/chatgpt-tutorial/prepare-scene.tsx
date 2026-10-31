import { ChatComposer } from "~/components/assistant/chatgpt-tutorial/primitives";

export const PrepareScene = () => (
	<div className="flex h-full w-full flex-col items-center justify-center px-12 pb-16">
		<div className="w-full max-w-3xl">
			<h2 className="mb-10 text-center text-4xl font-normal">
				Ready when you are.
			</h2>
			<ChatComposer />
		</div>
	</div>
);
