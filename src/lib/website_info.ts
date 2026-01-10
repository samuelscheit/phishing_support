import dns from "node:dns/promises";
import uniqBy from "lodash/uniqBy";
import uniq from "lodash/uniq";
import { parse } from "tldts";

export async function queryDns(domain: string) {
	const [a, aaaa, ns, mx, cname, txt] = await Promise.allSettled([
		dns.resolve4(domain),
		dns.resolve6(domain),
		dns.resolveNs(domain),
		dns.resolveMx(domain),
		dns.resolveCname(domain),
		dns.resolveTxt(domain),
	]);

	return {
		A: a.status === "fulfilled" ? a.value : [],
		AAAA: aaaa.status === "fulfilled" ? aaaa.value : [],
		NS: ns.status === "fulfilled" ? ns.value : [],
		MX: mx.status === "fulfilled" ? mx.value : [],
		CNAME: cname.status === "fulfilled" ? cname.value : [],
		TXT: txt.status === "fulfilled" ? txt.value.flat() : [],
	};
}

type VCardEntry = [string, Record<string, unknown>, string, string | string[] | string[][]];
type VCardArray = ["vcard", VCardEntry[]];
type RDAPVCard = Record<string, string | string[] | string[][]> & {
	fn?: string;
	org?: string;
	email?: string;
	tel?: string;
};

type RDAPPublicId = {
	type?: string;
	identifier?: string;
};

type RDAPLink = {
	value?: string;
	rel?: string;
	type?: string;
	href?: string;
};

type RDAPEventMap = Record<string, string>;

export type RDAPEntity = {
	remarks: string;
	handle?: string;
	roles: string[];
	links: RDAPLink[];
	publicIds: RDAPPublicId[];
	entities?: RDAPEntity[];
	vcard?: RDAPVCard | null;
};

type RDAPAbuseContact = RDAPVCard & {
	remarks: string;
};

type RDAPCIDR = {
	v4prefix?: string;
	v6prefix?: string;
	length?: number;
};

type RDAPIPInfo = RDAPEntity & {
	startAddress?: string;
	endAddress?: string;
	ipVersion?: string;
	name?: string;
	type?: string;
	country?: string;
	parentHandle?: string;
	cidr0_cidrs: RDAPCIDR[];
	status: string[];
	events: RDAPEventMap;
	port43?: string;
	ip: string;
	abuse: RDAPAbuseContact | null;
};

type RDAPDomainInfo = {
	domain: string;
	status: string[];
	events: RDAPEventMap;
	nameservers: string[];
	secureDNS?: unknown;
	registrar: RDAPEntity | null;
};

function parseVCard(vcardArray?: VCardArray): RDAPVCard | null {
	if (!vcardArray || vcardArray[0] !== "vcard") return null;
	const entries = vcardArray[1] ?? [];
	const parsed: RDAPVCard = {};

	for (const entry of entries) {
		const [name, _meta, _type, value] = entry;
		if (!name) continue;
		const existing = parsed[name];
		if (!existing) {
			parsed[name] = value;
		} else if (Array.isArray(existing)) {
			existing.push(value as any);
		} else {
			parsed[name] = [existing, value] as any;
		}
	}

	return parsed;
}

function simplifyEntity(entity: any): RDAPEntity {
	const entities: RDAPEntity[] | null = entity.entities ? entity.entities.map(simplifyEntity) : null;

	return {
		remarks: (entity.remarks ?? [])
			.map((remark: any) => remark.description ?? [])
			.flat()
			.join("\n")
			.replaceAll(/\r+/g, ""),
		handle: entity.handle,
		roles: entity.roles ?? [],
		links: entity.links ?? [],
		publicIds: entity.publicIds ?? [],
		...(entities
			? {
					entities,
				}
			: {}),
		...(entity.vcardArray
			? {
					vcard: parseVCard(entity.vcardArray),
				}
			: {}),
	};
}

async function queryRDAPDomain(domain: string): Promise<RDAPDomainInfo | undefined> {
	const response = await fetch(`https://rdap.verisign.com/com/v1/domain/${domain}`, {
		method: "GET",
		headers: {
			Accept: "application/rdap+json",
		},
	});

	if (!response.ok) return;

	const json = await response.json();
	if (!json) return json;

	return simplifyDomainRDAP(json, domain);
}

async function queryIP(ip: string): Promise<RDAPIPInfo> {
	const response = await fetch(`https://rdap.db.ripe.net/ip/${ip}`, {
		method: "GET",
		headers: {
			Accept: "application/rdap+json",
		},
	});

	const json = await response.json();

	return simplifyIP(json, ip);
}

function simplifyDomainRDAP(json: any, domain: string): RDAPDomainInfo {
	const registrarEntity = (json.entities ?? []).find((entity: any) => entity.roles?.includes("registrar"));
	const events = (json.events ?? []).reduce((acc: Record<string, string>, event: any) => {
		if (event?.eventAction && event?.eventDate) {
			acc[event.eventAction] = event.eventDate;
		}
		return acc;
	}, {});

	return {
		domain: json.ldhName ?? domain,
		status: json.status ?? [],
		events,
		nameservers: (json.nameservers ?? []).map((nameserver: any) => nameserver.ldhName).filter(Boolean),
		secureDNS: json.secureDNS,
		registrar: registrarEntity ? simplifyEntity(registrarEntity) : null,
	};
}

function recursiveAbuseContact(entity: RDAPEntity, info = ""): RDAPAbuseContact | null {
	if (entity.roles?.includes("abuse")) {
		return {
			...(entity.vcard ?? {}),
			remarks: info + entity.remarks,
		};
	}

	if (entity.entities) {
		for (const child of entity.entities) {
			const result = recursiveAbuseContact(child, info + entity.remarks);
			if (result) return result;
		}
	}

	return null;
}

function simplifyIP(json: any, ip: string): RDAPIPInfo {
	const events = (json.events ?? []).reduce((acc: Record<string, string>, event: any) => {
		if (event?.eventAction && event?.eventDate) {
			acc[event.eventAction] = event.eventDate;
		}
		return acc;
	}, {});

	const simplified = simplifyEntity(json);

	return {
		startAddress: json.startAddress,
		endAddress: json.endAddress,
		ipVersion: json.ipVersion,
		name: json.name,
		type: json.type,
		country: json.country,
		parentHandle: json.parentHandle,
		cidr0_cidrs: json.cidr0_cidrs ?? [],
		status: json.status ?? [],
		events,
		port43: json.port43,
		ip,
		...simplified,
		abuse: recursiveAbuseContact(simplified),
	};
}

function isIP(input: string) {
	return /^\d{1,3}(\.\d{1,3}){3}$/.test(input);
}

export type WhoISInfo = {
	rdap?: RDAPDomainInfo;
	dns?: Awaited<ReturnType<typeof queryDns>>;
	nameserver_info?: RDAPDomainInfo[];
	ip_rdaps: RDAPIPInfo[];
	root_info?: WhoISInfo;
};

export async function getInfo(domain_or_ip: string): Promise<WhoISInfo> {
	const target = domain_or_ip.startsWith("http") ? new URL(domain_or_ip).hostname : domain_or_ip;

	if (isIP(target)) {
		const rdap = await queryIP(target);

		return { ip_rdaps: [rdap] };
	}

	const { domain } = parse(domain_or_ip);
	var root_info = undefined as Awaited<ReturnType<typeof getInfo>> | undefined;

	if (domain !== domain_or_ip && domain) {
		// also query root subdomain
		root_info = await getInfo(domain);
	}

	const [rdap, dns_info] = await Promise.all([queryRDAPDomain(target), queryDns(target)]);

	var nameservers = uniq([...dns_info.NS, ...(rdap?.nameservers || [])].map((x) => parse(x).domain).filter(Boolean) as string[]);
	let nameserver_info = undefined as RDAPDomainInfo[] | undefined;

	if (nameservers.length) {
		nameserver_info = (await Promise.allSettled(nameservers.map(queryRDAPDomain)))
			.filter((info) => info.status === "fulfilled" && info.value !== null)
			.map((info) => (info as PromiseFulfilledResult<RDAPDomainInfo>).value);
	}

	const ip_addresses = [...dns_info.A, ...dns_info.AAAA];

	const ip_rdaps = uniqBy(await Promise.all(ip_addresses.map((ip) => queryIP(ip))), (item) => item.abuse?.email || item.handle);

	return {
		rdap,
		dns: dns_info,
		nameserver_info,
		ip_rdaps,
		root_info,
	};
}

function report() {}

// const link = "https://samuelscheit.com";
// const link = "mail7.rzhlzl.com";
// const link = "https://saewar.com/De56Mgw1A";
// const link = "34.102.117.75";

// const result = await getInfo(link);
// console.dir(result, { depth: null });
