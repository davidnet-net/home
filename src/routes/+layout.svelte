<script>
	import { AppShell } from "@davidnet-net/svelte-ui";

	import * as paraglideRuntime from "$lib/paraglide/runtime.js";

	let { children } = $props();
</script>

<AppShell appName="Home" shortAppName="Home" {paraglideRuntime}>
	{#snippet banners()}
		<!--<Banner appearance="warning" icon="frame_source">Davidnet development mode active!</Banner>-->
	{/snippet}
	{@render children()}
</AppShell>
