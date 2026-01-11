"use client";

import { useEffect, useState, use } from "react";
import { format } from "date-fns";
import { AnalysisLogs } from "@/components/AnalysisLogs";
import { AnalysisProgress } from "@/components/AnalysisProgress";
import { SubmissionStatus } from "@/components/SubmissionStatus";
import { ExternalLinkConfirm } from "@/components/ExternalLinkConfirm";
import { UrlParts } from "@/components/UrlParts";
import { WhoisTab } from "@/components/WhoisTab";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExternalLink, Mail, Globe, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { AnalysisRun, Artifact, Report, Submission } from "../../../lib/db/schema";

type SubmissionDetail = Submission & {
	analysisRuns: AnalysisRun[];
	reports: Report[];
	artifacts: Artifact[];
};

export default function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
	const resolvedParams = use(params);
	const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
	const [loading, setLoading] = useState(true);
	const [websiteHtml, setWebsiteHtml] = useState<string | null>(null);
	const [websiteHtmlError, setWebsiteHtmlError] = useState<string | null>(null);

	const statusKey = (submission?.status || "").toLowerCase();
	const isFailed = statusKey === "failed";
	const isReported = statusKey === "reported";

	const defaultTab = ["new", "queued", "running"].includes(statusKey) ? "runs" : "reports";

	const safeHostname = (rawUrl?: string) => {
		if (!rawUrl) return null;
		try {
			return new URL(rawUrl).hostname;
		} catch {
			return null;
		}
	};

	const targetName =
		submission?.data?.kind === "website"
			? safeHostname(submission.data.website?.url)
			: (submission?.data.email?.subject as string | undefined) || "Untitled Submission";

	const websiteScreenshot = submission?.artifacts?.find(
		(a) => (a.name || "").toLowerCase() === "website.png" && (a.mimeType || "").startsWith("image/")
	);
	const websiteMhtml = submission?.artifacts?.find(
		(a) => (a.name || "").toLowerCase() === "website.mhtml" || (a.mimeType || "").toLowerCase() === "text/mhtml"
	);
	const artifacts = submission?.artifacts.filter((x) => x !== websiteScreenshot) || [];

	useEffect(() => {
		const fetchDetail = async () => {
			try {
				const res = await fetch(`/api/submissions/${resolvedParams.id}`);
				if (res.ok) {
					const data = await res.json();
					setSubmission(data);
				}
			} catch (err) {
				console.error("Failed to fetch submission:", err);
			} finally {
				setLoading(false);
			}
		};

		fetchDetail();
		const interval = setInterval(fetchDetail, 3000);
		return () => clearInterval(interval);
	}, [resolvedParams.id]);

	useEffect(() => {
		let cancelled = false;
		const renderWebsite = async () => {
			setWebsiteHtml(null);
			setWebsiteHtmlError(null);
			if (submission?.kind !== "website") return;
			if (!websiteMhtml?.id) {
				setWebsiteHtmlError("No website snapshot (MHTML) artifact found.");
				return;
			}

			try {
				const res = await fetch(`/api/artifacts/${websiteMhtml.id}`);
				if (!res.ok) throw new Error(`Failed to fetch MHTML: ${res.status}`);
				const bytes = new Uint8Array(await res.arrayBuffer());
				const { convert } = await import("mhtml-to-html/browser");
				const { data } = await convert(bytes, { enableScripts: false, fetchMissingResources: false });
				if (cancelled) return;
				setWebsiteHtml(data);
			} catch (err) {
				console.error("Failed to render website snapshot:", err);
				if (cancelled) return;
				setWebsiteHtmlError("Failed to render website snapshot.");
			}
		};

		renderWebsite();
		return () => {
			cancelled = true;
		};
	}, [submission?.kind, websiteMhtml?.id]);

	if (loading && !submission) return <div className="p-10 text-center">Loading...</div>;
	if (!submission) return <div className="p-10 text-center">Submission not found</div>;

	return (
		<div className="container mx-auto py-10 px-4 space-y-6">
			<div className="flex items-center justify-between">
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<Link href="/" className="text-sm text-muted-foreground hover:underline">
							Submissions
						</Link>
						<span className="text-muted-foreground">/</span>
						<span className="text-sm font-medium">{targetName}</span>
					</div>
				</div>
			</div>

			<div className="grid gap-6 md:grid-cols-12">
				<Card className="md:col-span-8">
					<CardHeader className="pb-4">
						<div className="flex justify-between items-center gap-4">
							<CardTitle className="flex flex-row items-center gap-2 min-w-0">
								{submission.kind === "website" ? (
									<Globe className="h-8 w-8 shrink-0" />
								) : (
									<Mail className="h-8 w-8 shrink-0" />
								)}
								<span className="leading-none text-2xl -mt-1 truncate">{targetName}</span>
							</CardTitle>
							<div className="flex flex-row items-end gap-2 shrink-0">
								<Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
									{format(new Date(submission.createdAt), "PPP p")}
								</Badge>

								<SubmissionStatus status={submission.status} />
							</div>
						</div>
					</CardHeader>
					<CardContent className="space-y-5">
						{isReported && submission.data.kind === "website" ? (
							<div className="rounded-md border bg-destructive/10 p-3">
								<div className="flex items-center gap-2 text-xs font-semibold text-destructive">
									<ShieldAlert className="h-4 w-4" />
									Phishing Site
								</div>
								<div className="mt-1 text-sm font-bold text-destructive">
									Do not visit this site or enter any sensitive information.
								</div>
								<div className="text-xs text-slate-800">
									A phishing website is a fake site that looks like a real, trusted one (like your bank or a popular
									store). It tries to trick you into entering private information, such as your email, phone number,
									password or credit card.
								</div>
							</div>
						) : null}

						{isFailed && submission.info ? (
							<div className="rounded-md border bg-muted/30 p-3">
								<div className="text-xs font-semibold text-muted-foreground">Failure reason</div>
								<div className="mt-1 text-sm whitespace-pre-wrap">{submission.info}</div>
							</div>
						) : null}

						{submission.data.kind === "website" && (
							<div className="space-y-2">
								<div className="flex items-center justify-between gap-3">
									<h4 className="text-sm font-semibold">Website</h4>
								</div>
								<div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3">
									<div className="min-w-0 flex-1">
										{submission.data.website?.url ? (
											<UrlParts url={submission.data.website.url} />
										) : (
											<div className="font-mono text-xs">—</div>
										)}
									</div>
									{submission.data.website?.url ? (
										<ExternalLinkConfirm
											href={submission.data.website.url}
											trigger={
												<button
													type="button"
													className="shrink-0 rounded-sm p-1 text-muted-foreground hover:text-primary"
													aria-label="Open target URL"
												>
													<ExternalLink className="h-4 w-4" />
												</button>
											}
										/>
									) : null}
								</div>
							</div>
						)}

						{submission.data.kind === "email" && (
							<div className="space-y-2">
								<h4 className="text-sm font-semibold">Email</h4>
								<div className="grid gap-3 sm:grid-cols-2">
									<div className="rounded-lg border bg-muted/30 p-3">
										<div className="text-xs text-muted-foreground">From</div>
										<div className="mt-1 font-mono text-xs break-all">{submission.data.email?.from || "—"}</div>
									</div>
									<div className="rounded-lg border bg-muted/30 p-3">
										<div className="text-xs text-muted-foreground">Subject</div>
										<div className="mt-1 text-sm font-medium wrap-break-word">
											{submission.data.email?.subject || "—"}
										</div>
									</div>
								</div>
							</div>
						)}
					</CardContent>
				</Card>

				<div className="md:col-span-4">
					{websiteScreenshot ? (
						<Card className="overflow-hidden">
							<div className="aspect-video bg-muted overflow-hidden">
								<img
									src={`/api/artifacts/${websiteScreenshot.id}`}
									alt="website.png"
									className="object-cover w-full h-full"
								/>
							</div>
						</Card>
					) : isFailed && submission.info ? (
						<Card>
							<CardHeader>
								<CardTitle>Error</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="text-sm whitespace-pre-wrap">{submission.info}</div>
							</CardContent>
						</Card>
					) : null}
				</div>
			</div>

			<Tabs defaultValue={defaultTab} className="w-full">
				<TabsList>
					{submission.kind === "website" ? <TabsTrigger value="website">Website</TabsTrigger> : null}
					<TabsTrigger value="reports">Reports ({submission.reports.length})</TabsTrigger>
					<TabsTrigger value="runs">Analysis ({submission.analysisRuns.length})</TabsTrigger>
					<TabsTrigger value="artifacts">Files ({artifacts.length})</TabsTrigger>
					{submission.kind === "website" ? <TabsTrigger value="whois">WhoIS</TabsTrigger> : null}
				</TabsList>
				{submission.kind === "website" && websiteMhtml ? (
					<TabsContent value="website" className="space-y-4 mt-4">
						<Card className="overflow-hidden">
							<CardHeader className="py-3">
								<CardTitle className="text-sm flex flex-row items-center gap-2">
									Archived Website
									<div className="text-xs text-muted-foreground font-normal">
										(from {format(new Date(websiteMhtml.createdAt), "PPP p")})
									</div>
								</CardTitle>
								<CardDescription className="text-xs flex flex-row gap-8">
									<div className="text-zinc-500 font-semibold font-mono">DO NOT ENTER ANY SENSITIVE INFORMATION</div>
								</CardDescription>
							</CardHeader>
							<CardContent className="p-0">
								{websiteHtmlError ? (
									<div className="p-4 text-sm text-muted-foreground">{websiteHtmlError}</div>
								) : websiteHtml ? (
									<iframe
										title="Archived Website"
										srcDoc={websiteHtml}
										className="w-full h-[75vh] bg-background"
										sandbox=""
										referrerPolicy="no-referrer"
									/>
								) : (
									<div className="p-4 text-sm text-muted-foreground">Rendering…</div>
								)}
							</CardContent>
						</Card>
					</TabsContent>
				) : null}
				{submission.data.kind === "website" ? (
					<TabsContent value="whois" className="space-y-4 mt-4">
						<WhoisTab url={submission.data.website?.url} whois={submission.data.website?.whois} />
					</TabsContent>
				) : null}
				<TabsContent value="reports" className="space-y-4 mt-4">
					{submission.reports.length > 0 ? (
						submission.reports.map((r: any) => (
							<Card key={r.id} className="overflow-hidden">
								<CardContent className="p-4 space-y-3">
									<div className="flex justify-between items-center">
										<CardTitle className="text-lg">{r.to}</CardTitle>
										<Badge variant="outline">{r.type || "report"}</Badge>
									</div>
									{r.subject && (
										<div className="text-sm">
											<span className="text-muted-foreground">Subject:</span> {r.subject}
										</div>
									)}
									<div className="text-sm whitespace-pre-wrap">{r.body || "No body"}</div>
								</CardContent>
							</Card>
						))
					) : (
						<div className="text-center py-10 text-muted-foreground">No reports yet.</div>
					)}
				</TabsContent>
				<TabsContent value="runs" className="space-y-4 mt-4">
					<AnalysisProgress streamId={submission.id} status={submission.status} />

					{submission.analysisRuns.map((run: any) => (
						<Card key={run.id} className="overflow-hidden">
							<CardHeader className="bg-muted/50 py-3">
								<div className="flex justify-between items-center">
									<CardTitle className="text-sm font-mono uppercase">Run #{run.id}</CardTitle>
									<Badge variant={run.status === "completed" ? "default" : "outline"}>{run.status}</Badge>
								</div>
							</CardHeader>
							<CardContent className="p-0">
								<AnalysisLogs streamId={run.id} output={run.output} />
							</CardContent>
						</Card>
					))}
				</TabsContent>
				<TabsContent value="artifacts" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
					{artifacts.length > 0 ? (
						artifacts.map((a) => (
							<Card key={a.id} className="overflow-hidden">
								{a.mimeType?.startsWith("image/") ? (
									<div className="aspect-video bg-muted relative">
										<img src={`/api/artifacts/${a.id}`} alt={a.name!} className="object-cover w-full h-full" />
									</div>
								) : (
									<div className="aspect-video flex items-center justify-center bg-muted">
										<ShieldAlert className="w-10 h-10 text-muted-foreground" />
									</div>
								)}
								<CardHeader className="p-3">
									<CardTitle className="text-xs truncate">{a.name || a.kind}</CardTitle>
									<CardDescription className="text-[10px]">
										{a.mimeType} • {((a.size || 0) / 1024).toFixed(1)} KB
									</CardDescription>
								</CardHeader>
								<CardContent className="p-3 pt-0">
									<a
										href={`/api/artifacts/${a.id}`}
										download={a.name}
										className="text-[10px] text-primary hover:underline font-medium"
									>
										Download
									</a>
								</CardContent>
							</Card>
						))
					) : (
						<div className="text-center py-10 text-muted-foreground md:col-span-full">
							No artifacts found for this submission.
						</div>
					)}
				</TabsContent>
			</Tabs>
		</div>
	);
}
