<script lang="ts">
	import {
		ThemeProvider,
		Toaster,
		ConnectivityCheck,
		ThemeMenu,
		FlexWrapper,
		Avatar,
		Loader,
		IconButton,
		getSessionInfo, isAuthenticated, refreshAccessToken
	} from "@davidnet/svelte-ui";
	import favicon from "$lib/assets/favicon.svg";
	import { onMount } from "svelte";
	import type { SessionInfo } from "$lib/types";
	import { page } from "$app/state";

	let { children } = $props();

	let correlationID = crypto.randomUUID();
	let authed = $state(false);
	let si: SessionInfo | null = $state(null);

	let fontsLoaded = $state(false);

	// This will run only in the browser
	if (typeof window !== "undefined") {
		document.fonts.ready.then(() => {
			fontsLoaded = true;
		});
	}

	onMount(async () => {
		const initloader = document.getElementById("initloader");
		if (initloader) initloader.remove();
		try {
			si = await getSessionInfo(correlationID, true);

			if (!(await isAuthenticated(correlationID)) || !si) {
				window.location.href = "https://account.davidnet.net/login?redirect=" + encodeURIComponent(page.url.toString());
				return;
			}

			if (!si || si.email_verified === 0) {
				window.location.href = "https://account.davidnet.net/verify/email/check/" + si?.email;
				return;
			}

			authed = true;
			setInterval(
				() => {
					refreshAccessToken(correlationID, true, false);
				},
				12 * 60 * 1000
			);
		} catch (e) {
			console.error("Session error:", e);
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<ThemeProvider />
<Toaster />
<ConnectivityCheck />

{#if fontsLoaded}
	<nav id="main-nav">
		<div class="nav-left">
			<IconButton icon="arrow_back" alt="Go back" onClick={()=> {window.history.back();}} appearance="subtle" /><a href="/">Home</a>
		</div>
		<div class="nav-center">Davidnet</div>
		<div class="nav-right">
			<ThemeMenu />
			<Avatar id={String(si?.userId)} owner name={si?.display_name} presence="online" src={si?.profilePicture} />
		</div>
	</nav>
{/if}

<FlexWrapper direction="column" height="calc(100vh - 48px);" width="100%;" justifycontent="flex-start" alignitems="center">
	{#if fontsLoaded}
		{@render children?.()}
	{:else}
		<Loader />
	{/if}
</FlexWrapper>

<style>
	#main-nav {
		height: 48px;
		width: calc(100% - 3rem);
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 1.5rem;
		background-color: var(--token-color-surface-raised-normal);
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
		user-select: none;
		font-weight: 600;
		font-size: 0.9rem;
	}

	#main-nav > div {
		flex: 1;
		display: flex;
		align-items: center;
	}

	.nav-left a {
		text-decoration: none;
		color: var(--token-color-text-default-normal);
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.nav-center {
		justify-content: center;
	}

	.nav-right {
		justify-content: flex-end;
	}
</style>
