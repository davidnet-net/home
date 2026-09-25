<script lang="ts">
	import {
		Button,
		Flex,
		getCookie,
		Modal,
		navigateBack,
		setCookie,
		Spinner
	} from "@davidnet-net/svelte-ui";
	import { onMount } from "svelte";

	let { children } = $props();

	let pass = $state(false);
	let loading = $state(true);

	onMount(() => {
		loading = false;
		const riskAccepted = getCookie("cgra"); // Community games risk accepted
		if (riskAccepted === "accepted") {
			pass = true;
		}
	});
</script>

{#if pass}
	{@render children()}
{:else if loading}
	<Flex justifyContent="center" alignItems="center" direction="column" gap="medium">
		<h1>CGRA</h1>
		<Spinner />
	</Flex>
{:else}
	<Modal title="Community games risk">
		<p>
			Community games may get or send content or data from external sources that are not governed by
			our Terms of Service or Privacy Policy. We are not responsible for the content, safety, or
			data practices of these third-party sources.
		</p>
		<p>
			<strong>Your risk acceptance is stored per device for 365 days!</strong>
		</p>

		{#snippet actions()}
			<Button
				iconbefore="arrow_back"
				onclick={() => {
					navigateBack();
				}}>
				Go back
			</Button>
			<Button
				appearance="danger"
				onclick={() => {
					setCookie("cgra", "accepted", 365);
					pass = true;
				}}>
				Accept risk
			</Button>
		{/snippet}
	</Modal>
{/if}
