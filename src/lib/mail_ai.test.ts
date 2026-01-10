import fs from "fs";
import path from "path";
import { analyzeMail } from "./mail_ai";

const input = fs.readFileSync(path.join(__dirname, "..", "..", "data", "mail.eml"), "utf-8");
// const input = fs.readFileSync(path.join(__dirname, "..", "..", "data", "teable.eml"), "utf-8");

analyzeMail(input, 1);
