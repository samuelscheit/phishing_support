import { simpleParser } from "mailparser";
import { writeFileSync } from "fs";
import { join } from "path";
import { extractEmlsFromIncomingMessage } from "../mail_forwarded";
import { cleanPrivateInformation, parseMail } from "../mail_ai";

// extractForwardedText({
// 	text: ``
// })
const mail = await simpleParser(``);

const result = await extractEmlsFromIncomingMessage(mail, "report@phishing.support");
// const parsed = await parseMail(result[0]);
const parsed = await simpleParser(result[0]);

delete parsed.text; // @ts-ignore
delete parsed.html;
delete parsed.textAsHtml;

// console.log(result[0]);
console.dir(parsed, { depth: null });

// writeFileSync(join(__dirname, "test.html"), parsed.html || "");
