<script>
	import { AppShell } from "@davidnet-net/svelte-ui";
	import * as paraglideRuntime from "$lib/paraglide/runtime.js";

	let { children } = $props();

	const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
</script>

<svelte:head>
	{#if isHttps}
		<meta http-equiv="content-security-policy" content="upgrade-insecure-requests" />
	{/if}
</svelte:head>

<AppShell appName="Home" shortAppName="Home" {paraglideRuntime}>
	{#snippet banners()}
		<!--<Banner appearance="warning" icon="frame_source">Davidnet development mode active!</Banner>-->
	{/snippet}
	{@render children()}
</AppShell>
