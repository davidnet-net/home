import { getSessionInfo, refreshAccessToken } from "$lib/session";

let lastRefreshTime: number | null = null;
let refreshCacheDuration = 10 * 60 * 1000; // 10 minutes in ms

export function formatDateWithUTCOffset(date: Date): string {
	const pad = (n: number) => n.toString().padStart(2, "0");

	const year = date.getFullYear();
	const month = pad(date.getMonth() + 1);
	const day = pad(date.getDate());

	const hours = pad(date.getHours());
	const minutes = pad(date.getMinutes());
	const seconds = pad(date.getSeconds());

	const offsetMinutes = date.getTimezoneOffset();
	const sign = offsetMinutes > 0 ? "-" : "+";
	const absOffset = Math.abs(offsetMinutes);
	const offsetHours = pad(Math.floor(absOffset / 60));
	const offsetMins = pad(absOffset % 60);

	return `${day}-${month}-${year} ${hours}:${minutes}:${seconds} UTC${sign}${offsetHours}:${offsetMins}`;
}

export async function formatDate_PREFERREDTIME(date: Date | string | undefined | null, correlationID: string): Promise<string> {
	if (!date) return "Invalid date";

	let d: Date;
	try {
		d = typeof date === "string" ? new Date(date) : date;
		if (isNaN(d.getTime())) return "Invalid date";
	} catch {
		return "Invalid date";
	}

	let timezone = "UTC";
	let dateFormat = "DD-MM-YYYY HH:mm";

	try {
		const now = Date.now();

		if (!lastRefreshTime || now - lastRefreshTime > refreshCacheDuration) {
			await refreshAccessToken(correlationID, true, false);
			lastRefreshTime = now;
		}

		const session = await getSessionInfo(correlationID, false);
		if (session?.preferences) {
			timezone = session.preferences.timezone || timezone;
			dateFormat = session.preferences.dateFormat || dateFormat;
		}
	} catch (err) {
		console.warn("Failed to get session preferences, using defaults", err);
	}

	try {
		const parts = new Intl.DateTimeFormat("en-US", {
			timeZone: timezone,
			day: "2-digit",
			month: "2-digit",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			hour12: false
		})
			.formatToParts(d)
			.reduce((acc: any, part) => {
				acc[part.type] = part.value;
				return acc;
			}, {});

		const day = parts.day ?? "??";
		const month = parts.month ?? "??";
		const year = parts.year ?? "????";
		const hour = parts.hour ?? "??";
		const minute = parts.minute ?? "??";

		switch (dateFormat) {
			case "DD-MM-YYYY HH:mm":
				return `${day}-${month}-${year} ${hour}:${minute}`;
			case "MM-DD-YYYY HH:mm":
				return `${month}-${day}-${year} ${hour}:${minute}`;
			case "YYYY-MM-DD HH:mm":
				return `${year}-${month}-${day} ${hour}:${minute}`;
			default:
				return `${day}-${month}-${year} ${hour}:${minute}`;
		}
	} catch {
		return "Invalid date";
	}
}

export async function wait(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
