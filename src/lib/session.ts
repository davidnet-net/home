import { writable, get } from "svelte/store";
import { toast } from "@davidnet/svelte-ui";
import { authapiurl } from "./config";
import type { SessionInfo } from "$lib/types";

export const accessToken = writable<string | null>(null);
let lastNotification = 0;

function rateLimitedToast(options: Parameters<typeof toast>[0], minInterval = 1000) {
	const now = Date.now();
	if (now - lastNotification < minInterval) return; // Skip if last notification was too recent
	lastNotification = now;
	toast(options);
}

// Variables
let refreshingPromise: Promise<boolean> | null = null;

/**
 * Gets a new access token!
 * @returns boolean if refresh is successful
 */
export async function refreshAccessToken(correlationID: string, silent?: boolean, freshdb?: boolean): Promise<boolean> {
	silent = silent ?? false;
	freshdb = freshdb ?? false;
	if (refreshingPromise) {
		// Another refresh is in progress, wait for it to finish
		return refreshingPromise;
	}

	refreshingPromise = (async () => {
		try {
			const res = await fetch(authapiurl + "refresh", {
				method: "POST",
				credentials: "include",
				headers: {
					"Content-Type": "application/json",
					"x-correlation-id": correlationID
				},
				body: JSON.stringify({
					freshdata: freshdb
				})
			});

			if (!res.ok) {
				accessToken.set(null);
				return false;
			}

			const data = await res.json();

			if (data.accessToken) {
				accessToken.set(data.accessToken);
				return true;
			} else {
				if (!silent) {
					rateLimitedToast({
						title: "Authentication Failed",
						desc: "Session expired",
						icon: "crisis_alert",
						appearance: "danger",
						position: "bottom-left"
					});
				}

				accessToken.set(null);
				return false;
			}
		} catch (error) {
			if (!silent) {
				rateLimitedToast({
					title: "Authentication Failed",
					desc: "Error: Couldn't connect to authentication servers.",
					icon: "crisis_alert",
					appearance: "danger",
					position: "bottom-left"
				});
			}
			accessToken.set(null);
			return false;
		} finally {
			refreshingPromise = null; // Clear that lock
		}
	})();

	return refreshingPromise;
}

/**
 * @returns SessionInfo | Returns null if unauthenticated.
 */
export async function getSessionInfo(correlationID: string, refresh?: boolean): Promise<SessionInfo | null> {
	refresh = refresh ?? true;
	let token = get(accessToken);

	if (!token && refresh) {
		const refreshed = await refreshAccessToken(correlationID);
		if (!refreshed) return null;
		token = get(accessToken);
		if (!token) return null;
	}
	if (!token) return null;

	try {
		const base64Url = token.split(".")[1];
		const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
		const jsonPayload = decodeURIComponent(
			atob(base64)
				.split("")
				.map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
				.join("")
		);

		return JSON.parse(jsonPayload) as SessionInfo;
	} catch {
		return null;
	}
}

/**
 * A wrapper around fetch that automatically adds Authorization and correlation ID headers,
 * and attempts to refresh the access token and retry the request on a 401 Unauthorized response.
 */
export async function authFetch(input: RequestInfo, correlationID: string, init?: RequestInit) {
	let token = get(accessToken);
	const headers = new Headers(init?.headers);

	if (token) {
		headers.set("Authorization", `Bearer ${token}`);
	}
	headers.set("x-correlation-id", correlationID);

	let res = await fetch(input, {
		...init,
		headers,
		credentials: "include"
	});

	if (res.status === 401) {
		const refreshed = await refreshAccessToken(correlationID);

		if (refreshed) {
			token = get(accessToken);
			if (token) {
				headers.set("Authorization", `Bearer ${token}`);
			}
			res = await fetch(input, {
				...init,
				headers,
				credentials: "include"
			});
		}
	}

	return res;
}

export async function isAuthenticated(correlationID: string): Promise<boolean> {
	const session = await getSessionInfo(correlationID);
	if (!session) return false;

	const now = Math.floor(Date.now() / 1000);
	return session.exp > now;
}

export async function getUserId(correlationID: string): Promise<number | null> {
	const session = await getSessionInfo(correlationID);
	return session ? session.userId : null;
}

export async function getUsername(correlationID: string): Promise<string | null> {
	const session = await getSessionInfo(correlationID);
	return session ? session.username : null;
}

export async function logout(): Promise<void> {
	accessToken.set(null);
	// TODO: invalidate session on the server
}
