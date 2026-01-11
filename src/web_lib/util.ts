import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { RDAPAbuseContact, RDAPEntity } from "../lib/website_info";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function recursiveAbuseContact(entity: RDAPEntity, info = ""): RDAPAbuseContact | null {
	if (!entity) return null;

	if (entity.roles?.includes("abuse")) {
		return {
			...(entity.vcard ?? {}),
			remarks: (info + "\n" + entity.remarks).trim(),
		};
	}

	if (entity.entities) {
		for (const child of entity.entities) {
			const result = recursiveAbuseContact(child, (info + "\n" + entity.remarks).trim());
			if (result) return result;
		}
	}

	return null;
}
