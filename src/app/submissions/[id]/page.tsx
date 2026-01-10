"use client";

import { useEffect, useState, use } from "react";
import { format } from "date-fns";
import { AnalysisLogs } from "@/components/AnalysisLogs";
import { AnalysisProgress } from "@/components/AnalysisProgress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExternalLink, Mail, Globe, MapPin, Clock, ShieldAlert } from "lucide-react";
import Link from "next/link";

type SubmissionDetail = {
	id: string;
	kind: "website" | "email";
	source: string;
	status: string;
	createdAt: string;
	data: any;
	analysisRuns: any[];
	reports: any[];
	artifacts: {
		id: string;
		name: string;
		kind: string;
		mimeType: string;
		size: number;
		createdAt: string;
	}[];
};

export default function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
	const resolvedParams = use(params);
	const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
	const [loading, setLoading] = useState(true);

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

	if (loading && !submission) return <div className="p-10 text-center">Loading...</div>;
	if (!submission) return <div className="p-10 text-center">Submission not found</div>;

	const targetName = submission.kind === "website" ? submission.data.website?.url : submission.data.email?.subject;

	return (
		<div className="container mx-auto py-10 px-4 space-y-6">
			<div className="flex items-center justify-between">
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<Link href="/" className="text-sm text-muted-foreground hover:underline">
							Submissions
						</Link>
						<span className="text-muted-foreground">/</span>
						<span className="text-sm font-medium">{submission.id}</span>
					</div>
					<h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
						{submission.kind === "website" ? <Globe className="w-8 h-8" /> : <Mail className="w-8 h-8" />}
						{targetName || "Untitled Submission"}
					</h1>
				</div>
				<Badge className="text-sm px-3 py-1 capitalize" variant={submission.status === "completed" ? "default" : "outline"}>
					{submission.status}
				</Badge>
			</div>

			<div className="grid gap-6 md:grid-cols-3">
				<Card className="md:col-span-2">
					<CardHeader>
						<CardTitle>Details</CardTitle>
						<CardDescription>Raw data and metadata from the submission</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							<div className="grid grid-cols-2 gap-4">
								<div className="flex items-center gap-2 text-sm">
									<Clock className="w-4 h-4 text-muted-foreground" />
									<span className="text-muted-foreground">Submitted:</span>
									<span>{format(new Date(submission.createdAt), "PPP p")}</span>
								</div>
								<div className="flex items-center gap-2 text-sm">
									<MapPin className="w-4 h-4 text-muted-foreground" />
									<span className="text-muted-foreground">Type:</span>
									<span className="capitalize">{submission.kind}</span>
								</div>
							</div>

							{submission.kind === "website" && (
								<div className="space-y-2">
									<h4 className="font-semibold text-sm">Target URL</h4>
									<div className="flex items-center gap-2 p-2 bg-accent rounded font-mono text-sm break-all">
										<span className="flex-1">{submission.data.website?.url}</span>
										<a
											href={submission.data.website?.url}
											target="_blank"
											rel="noreferrer"
											className="shrink-0 hover:text-primary"
										>
											<ExternalLink className="w-4 h-4" />
										</a>
									</div>
								</div>
							)}

							{submission.kind === "email" && (
								<div className="space-y-2">
									<h4 className="font-semibold text-sm">Email Info</h4>
									<div className="grid gap-2 text-sm">
										<div className="flex gap-2">
											<span className="text-muted-foreground w-16">From:</span>
											<span className="font-mono">{submission.data.email?.from}</span>
										</div>
										<div className="flex gap-2">
											<span className="text-muted-foreground w-16">Subject:</span>
											<span>{submission.data.email?.subject}</span>
										</div>
									</div>
								</div>
							)}
						</div>
					</CardContent>
				</Card>
			</div>

			<Tabs defaultValue="reports" className="w-full">
				<TabsList>
					<TabsTrigger value="reports">Reports ({submission.reports.length})</TabsTrigger>
					<TabsTrigger value="runs">Analysis ({submission.analysisRuns.length})</TabsTrigger>
					<TabsTrigger value="artifacts">Artifacts ({submission.artifacts.length})</TabsTrigger>
				</TabsList>
				<TabsContent value="reports" className="space-y-4 mt-4">
					{submission.reports.length > 0 ? (
						submission.reports.map((r: any) => (
							<Card key={r.id} className="overflow-hidden">
								<CardHeader className="bg-muted/50 py-3">
									<div className="flex justify-between items-center">
										<CardTitle className="text-sm font-mono uppercase">Report #{r.id}</CardTitle>
										<Badge variant="outline">{r.type || "report"}</Badge>
									</div>
								</CardHeader>
								<CardContent className="p-4 space-y-3">
									<div className="text-sm">
										<span className="text-muted-foreground">To:</span> {r.to || "Unknown"}
									</div>
									<div className="text-sm">
										<span className="text-muted-foreground">Subject:</span> {r.subject || "Untitled"}
									</div>
									<div className="text-sm whitespace-pre-wrap">{r.body || "No body"}</div>
								</CardContent>
							</Card>
						))
					) : (
						<div className="text-center py-10 text-muted-foreground">No reports yet.</div>
					)}
				</TabsContent>
				<TabsContent value="runs" className="space-y-4 mt-4">
					<AnalysisProgress streamId={submission.id} />

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
					{submission.artifacts.length > 0 ? (
						submission.artifacts.map((a) => (
							<Card key={a.id} className="overflow-hidden">
								{a.mimeType?.startsWith("image/") ? (
									<div className="aspect-video bg-muted relative">
										<img src={`/api/artifacts/${a.id}`} alt={a.name} className="object-cover w-full h-full" />
									</div>
								) : (
									<div className="aspect-video flex items-center justify-center bg-muted">
										<ShieldAlert className="w-10 h-10 text-muted-foreground" />
									</div>
								)}
								<CardHeader className="p-3">
									<CardTitle className="text-xs truncate">{a.name || a.kind}</CardTitle>
									<CardDescription className="text-[10px]">
										{a.mimeType} • {(a.size / 1024).toFixed(1)} KB
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
