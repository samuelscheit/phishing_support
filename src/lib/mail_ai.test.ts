import fs from "fs";
import path from "path";
import { analyzeMail, parseMail } from "./mail_ai";
import { getMailImage } from "./mail";

const input = fs.readFileSync(path.join(__dirname, "..", "..", "data", "mail.eml"), "utf-8");
// const input = fs.readFileSync(path.join(__dirname, "..", "..", "data", "teable.eml"), "utf-8");

// analyzeMail(input, 1);
const parsed = await parseMail(input);
console.log("Parsed mail:", parsed.html);
const image = await getMailImage(parsed);
fs.writeFileSync(path.join(__dirname, "..", "..", "data", "mail.png"), image);
