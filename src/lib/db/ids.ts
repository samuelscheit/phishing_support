import { Snowflake } from "@sapphire/snowflake";

const snowflake = new Snowflake(new Date("2024-01-01T00:00:00.000Z"));

export function generateId(): bigint {
	return snowflake.generate();
}

// @ts-ignore
BigInt.prototype.toJSON = function (): string {
	return this.valueOf().toString();
};
