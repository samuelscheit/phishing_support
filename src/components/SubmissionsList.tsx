"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Submission = {
	id: string;
	type: "website" | "email";
	target: string;
	title: string | null;
	status: string;
	createdAt: string;
};

export function SubmissionsList() {
	const [submissions, setSubmissions] = useState<Submission[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const fetchSubmissions = async () => {
			try {
				const res = await fetch("/api/submissions");
				if (res.ok) {
					const data = await res.json();
					setSubmissions(data);
				}
			} catch (err) {
				console.error("Failed to fetch submissions:", err);
			} finally {
				setLoading(false);
			}
		};

		fetchSubmissions();
		const interval = setInterval(fetchSubmissions, 5000);
		return () => clearInterval(interval);
	}, []);

	if (loading && submissions.length === 0) {
		return <div className="text-center py-10 text-muted-foreground">Loading submissions...</div>;
	}

	if (submissions.length === 0) {
		return <div className="text-center py-10 text-muted-foreground">No submissions found.</div>;
	}

	return (
		<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			{submissions.map((s) => (
				<Link key={s.id} href={`/submissions/${s.id}`}>
					<Card className="hover:bg-accent transition-colors cursor-pointer h-full">
						<CardHeader className="pb-2">
							<div className="flex justify-between items-start gap-2">
								<Badge variant={s.type === "website" ? "default" : "outline"} className="capitalize">
									{s.type}
								</Badge>
								<span className="text-xs text-muted-foreground whitespace-nowrap">
									{formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}
								</span>
							</div>
							<CardTitle className="text-lg line-clamp-1 mt-2">{s.title || s.target}</CardTitle>
							<CardDescription className="line-clamp-1 font-mono text-xs">{s.target}</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="flex items-center gap-2">
								<div className={`w-2 h-2 rounded-full ${s.status === "completed" ? "bg-green-500" : "bg-yellow-500"}`} />
								<span className="text-sm capitalize">{s.status}</span>
							</div>
						</CardContent>
					</Card>
				</Link>
			))}
		</div>
	);
}
