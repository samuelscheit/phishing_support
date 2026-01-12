import { SubmissionForm } from "@/components/SubmissionForm";
import { SubmissionsList } from "@/components/SubmissionsList";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Phishing Support",
	description: "Automated analysis and reporting of phishing threats.",
};

export default function Home() {
	return (
		<main className="container mx-auto py-10 px-4 space-y-10">
			<div className="text-center space-y-2">
				<h1 className="text-4xl font-bold tracking-tight">Phishing Support</h1>
				<p className="text-muted-foreground text-lg">Automated analysis and reporting of phishing threats.</p>
			</div>

			<SubmissionForm />

			<div className="space-y-4">
				<h2 className="text-2xl font-semibold">Recent Submissions</h2>
				<SubmissionsList />
			</div>
		</main>
	);
}
