import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	/* config options here */
	reactCompiler: true,
	serverExternalPackages: ["drizzle-orm", "puppeteer-real-browser", "rebrowser-puppeteer-core"],
};

export default nextConfig;
