import React from "react";
import Link from "next/link";

export function SiteHeader() {
	return (
		<header className="container mx-auto py-10 px-4">
			<div className="text-center space-y-2">
				<h1 className="text-4xl font-bold tracking-tight">Phishing Support</h1>
				<p className="text-muted-foreground text-lg">Automated analysis and reporting of phishing threats.</p>
			</div>
		</header>
	);
}

export function SiteFooter() {
	return (
		<footer className="border-t bg-background/50 mt-12">
			<div className="container mx-auto py-6 px-4 flex items-center justify-between">
				<p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Phishing Support</p>
				<div className="text-sm">
					<Link href="/info" className="underline hover:text-primary">
						Info
					</Link>
				</div>
			</div>
		</footer>
	);
}

export function SiteLayout({ children }: { children: React.ReactNode }) {
	return (
		<>
			<SiteHeader />

			<main className="container mx-auto px-4">{children}</main>

			<SiteFooter />
		</>
	);
}

export default SiteLayout;
