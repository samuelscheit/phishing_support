import { reportToGoogleSafeBrowsing } from "./util";

const result = await reportToGoogleSafeBrowsing({
	url: "https://saewar.com/De56Mgw1A",
	analysisText: "",
	explanation: `This site is a credential-harvesting clone impersonating **Trade Republic** (financial/brokerage/banking service):
- (1) hosted on **non‑Trade‑Republic domain**
- (2) **very recent domain registration**
- (3) **login flow specifically designed to collect a phone number and 4‑digit PIN**, matching Trade Republic’s real authentication scheme.`,
	submissionId: 12345n,
});

console.log(result);
