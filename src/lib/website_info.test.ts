// const link = "https://samuelscheit.com";
// const link = "mail7.rzhlzl.com";

import { getInfo } from "./website_info";

// const link = "https://saewar.com/De56Mgw1A";
const link = "34.102.117.75";

const result = await getInfo(link);
console.dir(result, { depth: null });
