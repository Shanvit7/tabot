import { createFileRoute } from "@tanstack/react-router";
import { Button } from "~/components/ui/button";

const Home = () => {
	return (
		<div className="min-h-screen bg-black flex items-center justify-center p-8">
			<div className="bg-white border-hard shadow-hard-xl p-8 max-w-md w-full">
				<div className="flex items-center gap-4 mb-6">
					<img src="/logo.png" alt="Tabot" className="h-16 w-16 border-hard" />
					<div>
						<h1 className="text-3xl font-bold tracking-tight">Tabot</h1>
						<p className="font-mono text-sm text-muted-foreground">
							Browser Activity Pipeline
						</p>
					</div>
				</div>

				<div className="space-y-3">
					<div className="border-hard shadow-hard-sm p-4">
						<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-1">
							Status
						</div>
						<div className="font-bold text-lg flex items-center gap-2">
							<span className="w-3 h-3 bg-lime border-hard inline-block" />
							Engine Ready
						</div>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div className="border-hard shadow-hard-sm p-4">
							<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
								Events
							</div>
							<div className="font-bold text-2xl">0</div>
						</div>
						<div className="border-hard shadow-hard-sm p-4">
							<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
								Processed
							</div>
							<div className="font-bold text-2xl">0</div>
						</div>
					</div>
				</div>

				<Button className="w-full mt-6 font-bold uppercase tracking-wider">
					Open Dashboard
				</Button>
			</div>
		</div>
	);
};

export const Route = createFileRoute("/")({
	component: Home,
});
