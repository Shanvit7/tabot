import { ArrowUp, Check, Search } from 'lucide-react';
import { useCurrentFrame } from 'remotion';
import {
	ChatComposer,
	DemoCursor,
	Reveal,
} from '~/components/assistant/chatgpt-tutorial/primitives';
import {
	getTypedText,
	getVerificationStage,
} from '~/components/assistant/chatgpt-tutorial/timeline';

const prompt = 'Use Tabot to summarize my research on CSS container queries.';

// Illustrative summary, never a read of the viewer’s browser data.
const summary = 'You explored CSS container queries for responsive components.';
const takeaways = [
	'Adapt components to their container, not the full viewport.',
	'Declare a query container with container-type: inline-size.',
	'Use @container rules to change styles as space changes.',
];

export const VerifyScene = () => {
	const frame = useCurrentFrame();
	const stage = getVerificationStage(frame);
	const composing = stage === 'compose';
	const calling = stage === 'calling';

	return (
		<div
			className={`flex h-full w-full flex-col items-center px-8 py-5 ${composing ? 'justify-center' : ''}`}
		>
			<div className="w-full max-w-3xl">
				{composing ? (
					<>
						<h2 className="mb-10 text-center text-4xl font-normal">
							What can I help with?
						</h2>
						<div className="relative">
							<ChatComposer tabot>
								{getTypedText(prompt, frame, 30, 135) ||
									'Ask about a topic you visited…'}
							</ChatComposer>
							<span className="absolute bottom-4 right-5 flex size-10 items-center justify-center rounded-full bg-white text-black">
								<ArrowUp className="size-6" />
								<DemoCursor at={170} className="left-3 top-4" />
							</span>
						</div>
					</>
				) : (
					<>
						<p className="mb-3 text-base text-tutorial-muted">
							Illustrative response · sample data, not your history
						</p>
						<div className="mb-4 ml-12 rounded-3xl bg-neutral-700/50 px-5 py-3 text-xl leading-7">
							{prompt}
						</div>
						<div className="rounded-xl border border-tutorial-line px-4 py-3">
							<div className="flex items-center gap-3 text-lg">
								{calling ? (
									<Search className="size-5" />
								) : (
									<Check className="size-5" />
								)}
								<span className="font-medium">Tabot</span>
								<code className="text-tutorial-muted">search_activity</code>
								<span className="ml-auto text-tutorial-muted">
									{calling ? 'Searching…' : 'Search complete'}
								</span>
							</div>
						</div>
						{stage === 'answer' ? (
							<Reveal at={240}>
								<div className="mt-4 text-xl leading-7">
									<p className="mb-2 font-medium">ChatGPT</p>
									<p>{getTypedText(summary, frame, 240, 135)}</p>
									<ul className="mt-3 list-inside list-disc space-y-2">
										{takeaways.map((takeaway, index) =>
											frame > 390 + index * 90 ? (
												<li key={takeaway}>
													{getTypedText(takeaway, frame, 390 + index * 90, 75)}
												</li>
											) : null,
										)}
									</ul>
								</div>
							</Reveal>
						) : null}
					</>
				)}
			</div>
		</div>
	);
};
