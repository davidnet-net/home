<script lang="ts">
	import { page } from "$app/state";
	import type { SessionInfo } from "$lib/types";
	import { onMount } from "svelte";
	import Error from "$lib/components/Error.svelte";
	import { refreshAccessToken, getSessionInfo, isAuthenticated, LinkButton, Loader, FlexWrapper, Icon } from "@davidnet/svelte-ui";

	let correlationID = crypto.randomUUID();
	let error = false;
	let Authenticated = false;

	onMount(async () => {
		try {
			const si: SessionInfo | null = await getSessionInfo(correlationID);

			if (!(await isAuthenticated(correlationID)) || !si || !si.admin) {
				window.location.href = "/login?redirect=" + encodeURIComponent(page.url.toString());
				return;
			}

			if (!si || si.email_verified === 0) {
				window.location.href = "/verify/email/check/" + si?.email;
				return;
			}

			Authenticated = true;
			setInterval(
				() => {
					refreshAccessToken(correlationID, true, false);
				},
				12 * 60 * 1000
			);
		} catch (e) {
			console.error("Session error:", e);
			error = true;
		}
	});
</script>

<div id="background">
	{#if error}
		<Error pageName="Admin list" errorMSG="Unknown" />
	{:else}
		<FlexWrapper width="100%" height="100%">
			{#if Authenticated}
                <Icon icon="shield" size="10rem" />
				<LinkButton href="https://account.davidnet.net/admin/">Account Admin</LinkButton>
				<LinkButton href="https://kanban.davidnet.net/admin/">Kanban Admin</LinkButton>
			{:else}
				<Loader />
			{/if}
		</FlexWrapper>
	{/if}
</div>

<style>
	#background {
		background-color: var(--token-color-surface-sunken-normal);
		padding: 4rem 5rem;
		padding-top: 0rem;
		border-radius: 1rem;
		width: 300px;
		height: 680px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
	}
</style>
