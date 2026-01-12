import type { Metadata } from "next";
import SiteLayout from "@/components/SiteLayout";
import About from "@/components/About";
import Donate from "@/components/Donate";
import Link from "next/link";

export const metadata: Metadata = {
	title: "Info — Phishing Support",
	description: "About the Phishing Support application and contact details.",
};

export default function InfoPage() {
	return (
		<SiteLayout>
			<div className="space-y-10">
				<About />

				<hr className="border-t my-6" />

				<Donate />

				<div className="pt-4">
					<Link href="/" className="underline hover:text-primary">
						Back to Home
					</Link>
				</div>
			</div>
		</SiteLayout>
	);
}
