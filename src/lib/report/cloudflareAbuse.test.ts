import { extractOutputText } from "../../components/AnalysisLogs";
import { solveCloudflareTurnstile } from "../browser/solveCloudflareTurnstile";
import { AnalysisRunsEntity, SubmissionsEntity } from "../db/entities";
import { reportCloudflareAbuse } from "./cloudflareAbuse";

// const result = await solveCloudflareTurnstile({
// 	url: "https://abuse.cloudflare.com/phishing",
// });

// console.log("Cloudflare Turnstile token:", result);

const [submission] = await SubmissionsEntity.list(1);
const [analysisRun] = await AnalysisRunsEntity.listForSubmission(submission.id);
const analysisText = extractOutputText(analysisRun.output!)!;

await reportCloudflareAbuse({
	url: submission.data.kind === "website" ? submission.data.website!.url : "",
	analysisText,
	submissionId: submission.id,
	// countryCode: "de",
	explanation: `The URL 'https://saewar.com/De56Mgw1A' is considered a phishing site because it presents a Trade Republic–branded login flow on an unrelated domain and attempts to harvest sensitive authentication data.

Key indicators:
- **Brand impersonation:** The page title and copy (“Trade Republic. Invest, spend and bank.” / “Melden Sie sich mit Ihrer Telefonnummer an.”) mimic Trade Republic’s legitimate login experience.
- **Credential harvesting:** The flow collects a **phone number** and then a **PIN**, which are high-value credentials for account takeover.
- **Domain mismatch:** It is not hosted on Trade Republic’s official domains (e.g., 'traderepublic.com'), which is a strong sign of brand impersonation.
- **Recently registered domain:** 'saewar.com' was registered on **2026-01-08** (only a few days old at the time of analysis), a common pattern for short-lived phishing campaigns.
- **Evasion tactics:** The opaque, token-like path ('/De56Mgw1A') and 'noindex,nofollow' meta tag suggest an attempt to avoid detection and indexing.
- **Disposable-style hosting posture:** Cloud-hosted infrastructure plus “throwaway” DNS characteristics (e.g., no MX records) align with rapidly deployed phishing kits.

Overall, the combination of Trade Republic branding, non-official domain hosting, and direct collection of phone number + PIN strongly indicates a Trade Republic credential-theft phishing page.`,
	infringedBrand: "Trade Republic (legitimate site: https://traderepublic.com)",
}).catch(console.log);
