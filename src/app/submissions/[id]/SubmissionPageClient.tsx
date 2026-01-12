"use client";

import { useEffect, useState } from "react";
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
import { AnalysisRun, Artifact, Report, Submission } from "@/lib/db/schema";

type SubmissionDetail = Submission & {
	analysisRuns: AnalysisRun[];
	reports: Report[];
	artifacts: Omit<Artifact, "blob" | "submissionId">[];
};

export function SubmissionPageClient({ id, initialSubmission }: { id: string; initialSubmission?: SubmissionDetail | null }) {
	const [submission, setSubmission] = useState<SubmissionDetail | null>(initialSubmission ?? null);
	const [loading, setLoading] = useState(initialSubmission ? false : true);
	const [websiteHtml, setWebsiteHtml] = useState<string | null>(null);
	const [websiteHtmlError, setWebsiteHtmlError] = useState<string | null>(null);
	const [emailHtml, setEmailHtml] = useState<string | null>(null);
	const [emailHtmlError, setEmailHtmlError] = useState<string | null>(null);

	const statusKey = (submission?.status || "").toLowerCase();
	const isFailed = statusKey === "failed";
	const isReported = statusKey === "reported";

	const isRunning = ["new", "queued", "running"].includes(statusKey);
	const runsToShow = submission ? (isRunning ? submission.analysisRuns : submission.analysisRuns.slice(0, 1)) : [];

	const defaultTab = "runs";

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
	const emailEml = submission?.artifacts?.find((a) => {
		const name = (a.name || "").toLowerCase();
		const mime = (a.mimeType || "").toLowerCase();
		const kind = (a.kind || "").toLowerCase();
		return name.endsWith(".eml") || name === "mail.eml" || mime === "message/rfc822" || kind === "eml";
	});
	const artifacts = submission?.artifacts.filter((x) => x !== websiteScreenshot) || [];

	const sanitizeHtmlForIframe = (rawHtml: string): string => {
		try {
			const parser = new DOMParser();
			const doc = parser.parseFromString(rawHtml, "text/html");

			// Remove active/embedding content.
			// doc.querySelectorAll("script, iframe, frame, object, embed, link[rel='preload'], link[rel='modulepreload']").forEach((el) =>
			// 	el.remove()
			// );

			// // Remove inline event handlers and block remote loads.
			// doc.querySelectorAll("*").forEach((el) => {
			// 	// strip on* handlers
			// 	[...el.attributes].forEach((attr) => {
			// 		if (attr.name.toLowerCase().startsWith("on")) el.removeAttribute(attr.name);
			// 	});

			// 	if (el instanceof HTMLAnchorElement) {
			// 		const href = el.getAttribute("href") || "";
			// 		if (/^(https?:)?\/\//i.test(href)) el.removeAttribute("href");
			// 	}

			// 	if (el instanceof HTMLImageElement) {
			// 		const src = el.getAttribute("src") || "";
			// 		// Avoid fetching remote images (tracking pixels etc.).
			// 		if (/^(https?:)?\/\//i.test(src)) el.removeAttribute("src");
			// 	}
			// });

			// Wrap in a minimal doc to keep email styles from leaking.
			return `<!doctype html><html><head><meta charset="utf-8" /><meta name="referrer" content="no-referrer" /></head><body>${doc.body.innerHTML}</body></html>`;
		} catch {
			return rawHtml;
		}
	};

	useEffect(() => {
		const fetchDetail = async () => {
			try {
				const res = await fetch(`/api/submissions/${id}`);
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
	}, [id]);

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

	useEffect(() => {
		let cancelled = false;
		const renderEmail = async () => {
			setEmailHtml(null);
			setEmailHtmlError(null);
			if (submission?.kind !== "email") return;
			if (!emailEml?.id) {
				setEmailHtmlError("No email (.eml) artifact found.");
				return;
			}

			try {
				const res = await fetch(`/api/artifacts/${emailEml.id}`);
				if (!res.ok) throw new Error(`Failed to fetch EML: ${res.status}`);
				const bytes = new Uint8Array(await res.arrayBuffer());

				const { default: PostalMime } = await import("postal-mime");
				const parser = new PostalMime();
				const parsed: any = await parser.parse(bytes);

				const raw =
					(parsed?.html as string | undefined) ||
					(typeof parsed?.text === "string" && parsed.text.trim().length > 0
						? `<!doctype html><html><head><meta charset="utf-8" /></head><body><pre style="white-space:pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">${parsed.text
								.replace(/&/g, "&amp;")
								.replace(/</g, "&lt;")
								.replace(/>/g, "&gt;")}</pre></body></html>`
						: "");

				if (!raw) {
					throw new Error("No HTML/text content in EML");
				}

				const safe = sanitizeHtmlForIframe(raw);
				if (cancelled) return;
				setEmailHtml(safe);
			} catch (err) {
				console.error("Failed to render email:", err);
				if (cancelled) return;
				setEmailHtmlError("Failed to render email.");
			}
		};

		renderEmail();
		return () => {
			cancelled = true;
		};
	}, [submission?.kind, emailEml?.id]);

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
					{submission.kind === "email" ? <TabsTrigger value="email">Email</TabsTrigger> : null}
					<TabsTrigger value="reports">Reports ({submission.reports.length})</TabsTrigger>
					<TabsTrigger value="artifacts">Files ({artifacts.length})</TabsTrigger>
					<TabsTrigger value="runs">Analysis</TabsTrigger>
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
				{submission.kind === "email" && emailEml ? (
					<TabsContent value="email" className="space-y-4 mt-4">
						<Card className="overflow-hidden">
							<CardHeader className="py-3">
								<CardTitle className="text-sm flex flex-row items-center gap-2">
									Archived Email
									<div className="text-xs text-muted-foreground font-normal">
										(from {format(new Date(emailEml.createdAt), "PPP p")})
									</div>
								</CardTitle>
								<CardDescription className="text-xs flex flex-row gap-8">
									<div className="text-zinc-500 font-semibold font-mono">
										DO NOT CLICK ANY LINKS NOR ENTER ANY SENSITIVE INFORMATION
									</div>
								</CardDescription>
							</CardHeader>
							<CardContent className="p-0">
								{emailHtmlError ? (
									<div className="p-4 text-sm text-muted-foreground">{emailHtmlError}</div>
								) : emailHtml ? (
									<iframe
										title="Archived Email"
										srcDoc={emailHtml}
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

					{runsToShow.length > 0 ? (
						runsToShow.map((run: any) => (
							<Card key={run.id} className={isRunning ? "overflow-hidden" : "overflow-hidden flex flex-col h-[90vh]"}>
								<CardHeader className="bg-muted/50 py-3 shrink-0">
									<div className="flex justify-between items-center">
										<CardTitle className="text-sm font-mono uppercase">Run #{run.id}</CardTitle>
										<Badge variant={run.status === "completed" ? "default" : "outline"}>{run.status}</Badge>
									</div>
								</CardHeader>
								<CardContent className={isRunning ? "p-0" : "p-0 flex-1 min-h-0"}>
									<AnalysisLogs streamId={run.id} output={run.output} className={isRunning ? undefined : "h-full"} />
								</CardContent>
							</Card>
						))
					) : (
						<div className="text-center py-10 text-muted-foreground">No analysis runs yet.</div>
					)}
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
