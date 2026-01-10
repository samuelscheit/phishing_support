"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Link, Mail, Upload, Loader2 } from "lucide-react";

export function SubmissionForm() {
	const router = useRouter();
	const [url, setUrl] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleUrlSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!url) return;

		setIsSubmitting(true);
		try {
			const res = await fetch("/api/submissions/website", {
				method: "POST",
				body: JSON.stringify({ url }),
				headers: { "Content-Type": "application/json" },
			});
			const data = await res.json();
			if (data.submissionId) {
				router.push(`/submissions/${data.submissionId}`);
			}
		} catch (err) {
			console.error(err);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleFileSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!file) return;

		setIsSubmitting(true);
		try {
			const formData = new FormData();
			formData.append("file", file);

			const res = await fetch("/api/submissions/email", {
				method: "POST",
				body: formData,
			});
			const data = await res.json();
			if (data.submissionId) {
				router.push(`/submissions/${data.submissionId}`);
			}
		} catch (err) {
			console.error(err);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Card className="w-full max-w-2xl mx-auto">
			<CardHeader>
				<CardTitle>Submit Phishing Threat</CardTitle>
				<CardDescription>Submit a suspicious website URL or upload a phishing email (EML) for analysis.</CardDescription>
			</CardHeader>
			<CardContent>
				<Tabs defaultValue="url" className="w-full">
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="url">
							<Link className="w-4 h-4 mr-2" />
							Website URL
						</TabsTrigger>
						<TabsTrigger value="email">
							<Mail className="w-4 h-4 mr-2" />
							Phishing Email
						</TabsTrigger>
					</TabsList>
					<TabsContent value="url">
						<form onSubmit={handleUrlSubmit} className="space-y-4 pt-4">
							<div className="space-y-2">
								<Label htmlFor="url">Website URL</Label>
								<Input
									id="url"
									placeholder="https://suspicious-site.com/login"
									value={url}
									onChange={(e) => setUrl(e.target.value)}
									required
								/>
							</div>
							<Button type="submit" className="w-full" disabled={isSubmitting}>
								{isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
								Analyze Website
							</Button>
						</form>
					</TabsContent>
					<TabsContent value="email">
						<form onSubmit={handleFileSubmit} className="space-y-4 pt-4">
							<div className="space-y-2">
								<Label htmlFor="file">Email File (.eml)</Label>
								<div className="flex items-center justify-center w-full">
									<label
										htmlFor="file"
										className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted"
									>
										<div className="flex flex-col items-center justify-center pt-5 pb-6">
											<Upload className="w-8 h-8 mb-2 text-muted-foreground" />
											<p className="mb-2 text-sm text-muted-foreground">
												<span className="font-semibold">Click to upload</span> or drag and drop
											</p>
											<p className="text-xs text-muted-foreground">EML files only</p>
										</div>
										<Input
											id="file"
											type="file"
											className="hidden"
											accept=".eml"
											onChange={(e) => setFile(e.target.files?.[0] || null)}
										/>
									</label>
								</div>
								{file && <p className="text-sm text-muted-foreground mt-2">Selected: {file.name}</p>}
							</div>
							<Button type="submit" className="w-full" disabled={isSubmitting || !file}>
								{isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
								Analyze Email
							</Button>
						</form>
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
}
