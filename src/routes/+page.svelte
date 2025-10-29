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
		formatDate_PREFERREDTIME
	} from "@davidnet/svelte-ui";
	import { onMount } from "svelte";

	let correlationID = crypto.randomUUID();
	let sessionInfo: SessionInfo | null = $state(null);
	let greeting = $state("");
	let time = $state("Time is timing...");
	let caninternal = $state(false);

	// Apps
	const apps = [
		{ label: "Kanban", href: "https://kanban.davidnet.net", icon: "view_kanban" },
		{ label: "Account", href: "https://account.davidnet.net", icon: "identity_platform" },
		{ label: "Files", href: "https://files.davidnet.net", icon: "smb_share" },
		{ label: "Chat", href: "https://chat.davidnet.net", icon: "chat" },
		{ label: "Whiteboard", href: "https://whiteboard.davidnet.net", icon: "draw" },
		{ label: "Status", href: "https://status.davidnet.net/", icon: "bigtop_updates" }
	];

	const internalApps = [
		{ label: "HA (External)", href: "https://homeassistant.davidnet.net", icon: "home" },
		{ label: "HAQR", href: "https://haqr.davidnet.net/manage", icon: "qr_code" },
		{ label: "Matrix", href: "https://chat.matrix.davidnet.net/", icon: "chat" },
		{ label: "Matrix ADMIN", href: "https://admin.matrix.davidnet.net/", icon: "shield" },
		{ label: "Uptimekuma", href: "https://uptimekuma.davidnet.net/", icon: "bigtop_updates" },
		{ label: "DN Github", href: "https://github.com/davidnet-net/", icon: "rebase_edit" },
		{ label: "Davidnet Design", href: "https://design.davidnet.net/", icon: "design_services" }
	];

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

	onMount(async () => {
		await refreshAccessToken(correlationID, true, true);
		sessionInfo = await getSessionInfo(correlationID);
		greeting = getGreeting(sessionInfo?.display_name ?? "");

		if (sessionInfo?.internal) {
			try {
				caninternal = await checkInternalDomain();
				console.log("Internal reachable?", caninternal);
			} catch (err) {
				caninternal = false;
			}
		}

		setInterval(async () => {
			time = await formatDate_PREFERREDTIME(new Date(), correlationID);
		}, 1000);
	});
</script>

<Space height="var(--token-space-6)" />

<div class="welcomebox">
	<FlexWrapper width="100%" direction="row" justifycontent="space-between" alignitems="center" wrap="wrap">
		<FlexWrapper direction="column" gap="0.3rem" flex="1 1 auto">
			<h1>{greeting}</h1>
			<span class="time-weather">{time} | <Weather /></span>
		</FlexWrapper>
	</FlexWrapper>
</div>

<Space height="var(--token-space-6)" />

<FlexWrapper width="80%" gap="var(--token-space-3)" wrap="wrap">
	<LinkButton iconbefore="notifications" href="/notifications">Notifications</LinkButton>
	<LinkButton iconbefore="tune" href="https://account.davidnet.net/account/settings/preferences">Preferences</LinkButton>
	<LinkButton iconbefore="policy" href="https://davidnet.net/legal/">Policies</LinkButton>
</FlexWrapper>

<Space height="var(--token-space-3)" />

<FlexWrapper alignitems="flex-start" width="80%" direction="column">
	<h2>Apps:</h2>
	<FlexWrapper gap="var(--token-space-3)" justifycontent="flex-start" direction="row" wrap="wrap">
		{#each apps as app}
			<a class="option" href={app.href}>
				<FlexWrapper width="100%" height="100%" gap="var(--token-space-2)">
					<Icon size="4rem" icon={app.icon} />
					<p class="option-text">{app.label}</p>
				</FlexWrapper>
			</a>
		{/each}
	</FlexWrapper>
</FlexWrapper>

{#if sessionInfo?.internal}
	<FlexWrapper alignitems="flex-start" width="80%" direction="column">
		<h2>Internal:</h2>
		<FlexWrapper gap="var(--token-space-3)" justifycontent="flex-start" direction="row" wrap="wrap">
			{#each internalApps as app}
				<a class="option" href={app.href}>
					<FlexWrapper width="100%" height="100%" gap="var(--token-space-2)">
						<Icon size="4rem" icon={app.icon} />
						<p class="option-text">{app.label}</p>
					</FlexWrapper>
				</a>
			{/each}

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
			{:else}
				<div class="option fallback">
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
	<span class="secondary-text">No activity for today.</span>
</FlexWrapper>

<Space height="var(--token-space-4)" />

<FlexWrapper alignitems="flex-start" width="80%">
	<h2>Recent activity:</h2>
	<span class="secondary-text">No recent activity.</span>
</FlexWrapper>

<Space height="var(--token-space-6)" />

<style>
	.welcomebox {
		width: 100%;
		max-width: 80%;
		background-color: var(--token-color-background-primary-normal);
		padding: 1.5rem 2rem;
		border-radius: 1rem;
		box-shadow: 0 4px 6px rgba(0,0,0,0.1);
		display: flex;
		flex-direction: column;
		justify-content: center;
		margin-bottom: var(--token-space-6);
	}

	.time-weather {
		font-size: 0.9rem;
		color: var(--token-color-text-secondary);
	}

	.option {
		text-decoration: none;
		color: var(--token-color-text-default-normal);
		text-align: center;
		border-radius: 2rem;
		background-color: var(--token-color-surface-overlay-normal);
		padding: 0.25rem;
		transition: transform 0.4s ease, box-shadow 0.4s ease;
		height: 8rem;
		flex: 1 1 8rem;
		max-width: 8rem;
	}

	.option:hover {
		background-color: var(--token-color-surface-overlay-hover);
		transform: scale(1.01);
		box-shadow: 0 2px 4px rgba(0,0,0,0.1);
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

	.secondary-text {
		color: var(--token-color-text-secondary);
		margin-left: var(--token-space-3);
	}

	@media (max-width: 768px) {
		.welcomebox {
			padding: 1rem;
		}

		.option {
			height: 7rem;
			flex: 1 1 45%;
			max-width: 6rem;
		}

		.option-text {
			font-size: 0.85rem;
		}
	}
</style>
