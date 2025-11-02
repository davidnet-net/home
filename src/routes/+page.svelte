<script lang="ts">
	import Weather from "$lib/components/Weather.svelte";
	import type { SessionInfo } from "$lib/types";
	import {
		FlexWrapper,
		Icon,
		LinkButton,
		Space,
		getSessionInfo,
		refreshAccessToken,
		formatDate_PREFERREDTIME,
		BlockNote,
		isMachineTimeSameAsPreferred
	} from "@davidnet/svelte-ui";
	import { onMount, onDestroy } from "svelte";

	let correlationID = crypto.randomUUID();
	let sessionInfo: SessionInfo | null = $state(null);
	let greeting = $state("");
	let time = $state("Time is timing...");
	let caninternal = $state(false);

	// 🆕 State for Uptime Kuma data
	let downServices: string[] = $state([]);
	let maintenanceServices: string[] = $state([]);

	function getGreeting(name: string | undefined) {
		if (!name) return "";
		const hour = new Date().getHours();
		if (hour < 6) return `Good night, ${name}.`;
		if (hour < 12) return `Good morning, ${name}.`;
		if (hour < 18) return `Good afternoon, ${name}.`;
		return `Good evening, ${name}.`;
	}

	function checkInternalDomain(): Promise<boolean> {
		return new Promise((resolve) => {
			const img = new Image();
			img.onload = () => resolve(true);
			img.onerror = () => resolve(false);
			img.src = "https://homeassistant.internal/static/icons/favicon.ico?" + Date.now();
		});
	}

	async function fetchStatusData() {
		try {
			const endpoints = ["/api/uptimekuma/down", "/api/uptimekuma/maintenance"];

			// Als intern: voeg ook interne endpoints toe
			if (sessionInfo?.internal) {
				endpoints.push("/api/uptimekuma/internal/down");
				endpoints.push("/api/uptimekuma/internal/maintenance");
			}

			const responses = await Promise.allSettled(endpoints.map((url) => fetch(url)));
			const jsons = await Promise.all(
				responses.map(async (res) => {
					if (res.status === "fulfilled" && res.value.ok) return res.value.json();
					return [];
				})
			);

			// Combineer en dedupliceer de resultaten
			const [downPublic, maintenancePublic, downInternal, maintenanceInternal] = jsons;
			const mergeUnique = (a: string[], b: string[]) => [...new Set([...a, ...b])];

			downServices = mergeUnique(
				downPublic.map((s: any) => s.name),
				(downInternal || []).map((s: any) => s.name)
			);
			maintenanceServices = mergeUnique(
				maintenancePublic.map((s: any) => s.name),
				(maintenanceInternal || []).map((s: any) => s.name)
			);
		} catch (err) {
			console.error("Error fetching status info:", err);
			downServices = [];
			maintenanceServices = [];
		}
	}

	let goodtime: boolean = $state(true);
	onMount(async () => {
		await refreshAccessToken(correlationID, true, true);
		sessionInfo = await getSessionInfo(correlationID);
		greeting = getGreeting(sessionInfo?.display_name ?? "");

		if (sessionInfo?.internal) {
			try {
				caninternal = await checkInternalDomain();
				console.log("Internal reachable?", caninternal);
			} catch {
				caninternal = false;
			}
		}

		await fetchStatusData();
		setInterval(fetchStatusData, 5 * 60 * 1000); // elke 5 min

		setInterval(async () => {
			time = await formatDate_PREFERREDTIME(new Date(), correlationID);
		}, 1000);

		goodtime = await isMachineTimeSameAsPreferred(correlationID);
	});

	let width = $state(window.innerWidth);
	const handleResize = () => {
		width = window.innerWidth;
	};
	window.addEventListener("resize", handleResize);
	onDestroy(() => {
		window.removeEventListener("resize", handleResize);
	});
</script>

<FlexWrapper direction="column" width="100%">
	<Space height="var(--token-space-6)" />
	{#if width > 600}
		<div class="welcomebox">
			<FlexWrapper width="100%" direction="row" justifycontent="flex-start">
				<FlexWrapper width="50%" alignitems="flex-start" direction="column" gap="0.6rem" justifycontent="flex-start">
					<h1 style="margin: 0px;">{greeting}</h1>
					<span style="margin-left: 5px;">{time} | <Weather /></span>
				</FlexWrapper>
			</FlexWrapper>
		</div>
	{:else}
		<div class="welcomebox">
			<FlexWrapper width="100%" direction="row" justifycontent="space-around">
				<h1 style="margin-top: -1rem;">{greeting}</h1>
				<FlexWrapper justifycontent="column" gap="var(--token-space-2)">
					<span>{time}</span>
					<span><Weather /></span>
				</FlexWrapper>
			</FlexWrapper>
		</div>
	{/if}
	<Space height="var(--token-space-6)" />
</FlexWrapper>

<FlexWrapper width="100%" direction="column">
	<FlexWrapper width="80%" direction="row" justifycontent="flex-start" wrap="wrap" gap="var(--token-space-2)">
		<LinkButton iconbefore="notifications" href="/notifications">Notifications</LinkButton>
		<LinkButton iconbefore="help" href="https://davidnet.net/help">Help</LinkButton>
		<LinkButton iconbefore="policy" href="https://davidnet.net/legal/">Policies</LinkButton>
		<LinkButton iconbefore="globe" href="https://davidnet.net/">Davidnet</LinkButton>
	</FlexWrapper>
	<Space height="var(--token-space-6)" />
</FlexWrapper>

<!-- 🆕 Dynamische blokken met publieke + interne statussen -->
<FlexWrapper width="80%" justifycontent="flex-start" direction="row" gap="var(--token-space-4)" wrap="wrap">
	{#if downServices.length > 0}
		<BlockNote
			appearance="error"
			title="Degraded services"
			actions={[
				{
					appearance: "link",
					content: "Status Page",
					href: "https://status.davidnet.net",
					onClick: () => {}
				}
			]}
		>
			{#each downServices as name}
				<p>{name} is experiencing issues.</p>
			{/each}
		</BlockNote>
	{/if}

	{#if maintenanceServices.length > 0}
		<BlockNote
			appearance="warning"
			title="Maintenance"
			actions={[
				{
					appearance: "link",
					content: "Status Page",
					href: "https://status.davidnet.net",
					onClick: () => {}
				}
			]}
		>
			{#each maintenanceServices as name}
				<p>{name} is currently under maintenance.</p>
			{/each}
		</BlockNote>
	{/if}

	{#if !goodtime}
		<BlockNote
			appearance="info"
			title="Timezone mismatch"
			actions={[
				{
					appearance: "link",
					content: "Edit Preferences",
					href: "https://account.davidnet.net/account/settings/preferences",
					onClick: () => {}
				}
			]}
		>
			It seems your device's time settings do not match your preferred timezone. This may lead to you seeing incorrect timestamps.
		</BlockNote>
	{/if}

	<BlockNote appearance="error" title="Work in progress">Some services or apps are still in work in progress and cannot be accessed.</BlockNote>
</FlexWrapper>

<Space height="var(--token-space-6)" />

<FlexWrapper alignitems="flex-start" width="80%">
	<h2>Apps:</h2>
	<FlexWrapper gap="var(--token-space-3)" justifycontent={width > 600 ? "flex-start" : "space-evenly"} direction="row" wrap="wrap">
		<a class="option" href="https://kanban.davidnet.net">
			<FlexWrapper width="100%" height="100%" gap="var(--token-space-2)">
				<Icon size="4rem" icon="view_kanban" />
				<p class="option-text">Kanban</p>
			</FlexWrapper>
		</a>
		<a class="option" href="https://account.davidnet.net">
			<FlexWrapper width="100%" height="100%" gap="var(--token-space-2)">
				<Icon size="4rem" icon="identity_platform" />
				<p class="option-text">Account</p>
			</FlexWrapper>
		</a>
		<a class="option" href="https://kanban.davidnet.net/utils">
			<FlexWrapper width="100%" height="100%" gap="var(--token-space-2)">
				<Icon size="4rem" icon="build" />
				<p class="option-text">Utils</p>
			</FlexWrapper>
		</a>
		<a class="option" href="https://files.davidnet.net">
			<FlexWrapper width="100%" height="100%" gap="var(--token-space-2)">
				<Icon size="4rem" icon="smb_share" />
				<p class="option-text">Files</p>
			</FlexWrapper>
		</a>
		<a class="option" href="https://chat.davidnet.net">
			<FlexWrapper width="100%" height="100%" gap="var(--token-space-2)">
				<Icon size="4rem" icon="chat" />
				<p class="option-text">Chat</p>
			</FlexWrapper>
		</a>
		<a class="option" href="https://whiteboard.davidnet.net">
			<FlexWrapper width="100%" height="100%" gap="var(--token-space-2)">
				<Icon size="4rem" icon="draw" />
				<p class="option-text">Whiteboard</p>
			</FlexWrapper>
		</a>
		<a class="option" href="https://status.davidnet.net/">
			<FlexWrapper width="100%" height="100%" gap="var(--token-space-2)">
				<Icon size="4rem" icon="bigtop_updates" />
				<p class="option-text">Status</p>
			</FlexWrapper>
		</a>
	</FlexWrapper>
</FlexWrapper>

{#if sessionInfo?.internal}
	<FlexWrapper alignitems="flex-start" width="80%">
		<h2>Internal:</h2>
		<FlexWrapper gap="var(--token-space-3)" justifycontent={width > 600 ? "flex-start" : "space-evenly"} direction="row" wrap="wrap">
			<a class="option" href="https://homeassistant.davidnet.net">
				<FlexWrapper width="100%" height="100%" gap="var(--token-space-2)">
					<Icon size="4rem" icon="home" />
					<p class="option-text">HA (External)</p>
				</FlexWrapper>
			</a>
			<a class="option" href="https://haqr.davidnet.net/manage">
				<FlexWrapper width="100%" height="100%" gap="var(--token-space-2)">
					<Icon size="4rem" icon="qr_code" />
					<p class="option-text">HAQR</p>
				</FlexWrapper>
			</a>
			<a class="option" href="https://chat.matrix.davidnet.net/">
				<FlexWrapper width="100%" height="100%" gap="var(--token-space-2)">
					<Icon size="4rem" icon="chat" />
					<p class="option-text">Matrix</p>
				</FlexWrapper>
			</a>
			<a class="option" href="https://admin.matrix.davidnet.net/">
				<FlexWrapper width="100%" height="100%" gap="var(--token-space-2)">
					<Icon size="4rem" icon="shield" />
					<p class="option-text">Matrix ADMIN</p>
				</FlexWrapper>
			</a>
			<a class="option" href="https://uptimekuma.davidnet.net/">
				<FlexWrapper width="100%" height="100%" gap="var(--token-space-2)">
					<Icon size="4rem" icon="bigtop_updates" />
					<p class="option-text">Uptimekuma</p>
				</FlexWrapper>
			</a>
			<a class="option" href="https://github.com/davidnet-net/">
				<FlexWrapper width="100%" height="100%" gap="var(--token-space-2)">
					<Icon size="4rem" icon="rebase_edit" />
					<p class="option-text">DN Github</p>
				</FlexWrapper>
			</a>
			<a class="option" href="https://design.davidnet.net/">
				<FlexWrapper width="100%" height="100%" gap="var(--token-space-2)">
					<Icon size="4rem" icon="design_services" />
					<p class="option-text">Davidnet Design</p>
				</FlexWrapper>
			</a>

			{#if caninternal}
				<a class="option" href="https://homeassistant.internal">
					<FlexWrapper width="100%" height="100%" gap="var(--token-space-2)">
						<Icon size="4rem" icon="home" />
						<p class="option-text">HA (Internal)</p>
					</FlexWrapper>
				</a>
				<a class="option" href="https://router.internal">
					<FlexWrapper width="100%" height="100%" gap="var(--token-space-2)">
						<Icon size="4rem" icon="router" />
						<p class="option-text">Router</p>
					</FlexWrapper>
				</a>
				<a class="option" href="https://glances.internal">
					<FlexWrapper width="100%" height="100%" gap="var(--token-space-2)">
						<Icon size="4rem" icon="monitor_heart" />
						<p class="option-text">Glances</p>
					</FlexWrapper>
				</a>
				<a class="option" href="https://pihole.internal">
					<FlexWrapper width="100%" height="100%" gap="var(--token-space-2)">
						<Icon size="4rem" icon="encrypted" />
						<p class="option-text">Pi-hole</p>
					</FlexWrapper>
				</a>
				<a class="option" href="https://zolder.internal">
					<FlexWrapper width="100%" height="100%" gap="var(--token-space-2)">
						<Icon size="4rem" icon="inventory_2" />
						<p class="option-text">Zolder</p>
					</FlexWrapper>
				</a>
			{:else}
				<div class="option" style="width: 16rem;">
					<FlexWrapper width="100%" height="100%" gap="var(--token-space-2)">
						<Icon size="4rem" icon="signal_disconnected" color="var(--token-color-text-danger);" />
						<p class="option-text">Not connected to internal network</p>
					</FlexWrapper>
				</div>
			{/if}
		</FlexWrapper>
	</FlexWrapper>
{/if}

<Space height="var(--token-space-4)" />

<FlexWrapper alignitems="flex-start" width="80%">
	<h2>Today:</h2>
	<span style="color: var(--token-color-text-secondary); margin-left: var(--token-space-3);">No activity for today.</span>
</FlexWrapper>

<Space height="var(--token-space-4)" />

<FlexWrapper alignitems="flex-start" width="80%">
	<h2>Recent activity:</h2>
	<span style="color: var(--token-color-text-secondary); margin-left: var(--token-space-3);">No recent activity.</span>
</FlexWrapper>

<style>
	.welcomebox {
		height: 4rem;
		width: 80%;
		background-color: var(--token-color-background-primary-normal);
		padding: 2rem;
		border-radius: 1rem;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
	}

	.welcomebox h1 {
		margin: 0px;
	}

	.option {
		text-decoration: none;
		color: var(--token-color-text-default-normal);
		text-align: center;
		border-radius: 2rem;
		background-color: var(--token-color-surface-overlay-normal);
		padding: 0.25rem;
		transition:
			transform 0.4s ease,
			box-shadow 0.4s ease;
		height: 8rem;
		width: 8rem;
	}

	.option:hover {
		background-color: var(--token-color-surface-overlay-hover);
		transform: scale(1.01);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.option:active,
	.option:focus {
		background-color: var(--token-color-surface-overlay-pressed);
	}

	.option:focus {
		outline: 2px solid var(--token-color-focusring);
	}

	.option-text {
		line-height: 1.2;
		margin: 0px;
		font-size: larger;
	}
</style>
