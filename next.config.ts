import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	/* config options here */
	reactCompiler: true,
	serverExternalPackages: ["puppeteer-real-browser", "rebrowser-puppeteer-core"],
	output: "export",
};

export default nextConfig;
