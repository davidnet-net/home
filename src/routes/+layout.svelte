<script>
	import { AppShell } from "@davidnet-net/svelte-ui";
	import * as paraglideRuntime from "$lib/paraglide/runtime.js";

	let { children } = $props();

	const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
</script>

<!-- Als de site via HTTPS draait, dwingen we de browser om HTTP-requests te upgraden. Issue met wobble towers -->
{#if isHttps}
	<svelte:head>
		<meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests">
	</svelte:head>
{/if}

<AppShell appName="Home" shortAppName="Home" {paraglideRuntime}>
	{#snippet banners()}
		<!--<Banner appearance="warning" icon="frame_source">Davidnet development mode active!</Banner>-->
	{/snippet}
	{@render children()}
</AppShell>
