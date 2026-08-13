<script lang="ts">
	import {
		appState,
		authState,
		Avatar,
		Flex,
		identityState,
		Skeleton,
		formatUnixMsToPreferred,
		whenAuthReady,
		Button,
		LinkButton,
		getFetch
	} from "@davidnet-net/svelte-ui";
	import { token } from "@davidnet-net/svelte-ui/tokens";

	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import HorizontalCard from "$lib/components/HorizontalCard/HorizontalCard.svelte";
	import { PUBLIC_ACCOUNT_FRONTEND_URL, PUBLIC_BACKEND_URL } from "$env/static/public";

	let internalAccessResult = $state(false);
	async function loadData() {
		const accessResult = await getFetch(
			PUBLIC_BACKEND_URL + "/auth/internal",
			undefined,
			undefined,
			true
		);

		if (accessResult.success) {
			internalAccessResult = accessResult.access.internalAccess;
		}
	}

	$effect(() => {
		(async () => {
			await whenAuthReady();
			if (!authState.isLoggedIn && !authState.loading) {
				goto(`${PUBLIC_ACCOUNT_FRONTEND_URL}/login?continue=${encodeURIComponent(page.url.href)}`);
			}
			loadData();
		})();
	});
</script>

<Flex alignItems="center" marginTop="giant" direction="column">
	<Flex width="90%" marginTop="giant" direction="column" gap="small">
		<Flex justifyContent="spaceBetween" height="fit-content">
			<h2>Apps:</h2>
			<LinkButton href="/" appearance="primary" iconbefore="arrow_back">Back</LinkButton>
		</Flex>
		<Flex gap="medium" height="fit-content" marginBottom="giant" flexWrap="wrap">
			<HorizontalCard
				title="Account"
				description=""
				icon="for_you"
				href={PUBLIC_ACCOUNT_FRONTEND_URL} />
			<HorizontalCard title="Docs" description="" icon="docs" href="https://docs.davidnet.net" />
			<HorizontalCard
				title="Kanban"
				description=""
				icon="view_kanban"
				href="https://kanban.davidnet.netd" />
		</Flex>
		<Flex justifyContent="spaceBetween" height="fit-content">
			<h2>Links</h2>
		</Flex>
		<Flex gap="medium" height="fit-content" marginBottom="giant" flexWrap="wrap">
			<HorizontalCard
				title="Privacy & policies"
				description=""
				icon="policy"
				href="https://davidnet.net/legal" />
			<HorizontalCard
				title="Help & support"
				icon="contact_support"
				href="https://davidnet.net/help" />
			<HorizontalCard title="Davidnet" icon="globe" href="https://davidnet.net" />
		</Flex>
		{#if internalAccessResult}
			<Flex justifyContent="spaceBetween" height="fit-content">
				<h2>Internal</h2>
			</Flex>
			<Flex gap="medium" height="fit-content" marginBottom="giant" flexWrap="wrap">
				<HorizontalCard
					title="Grafana"
					description=""
					icon="monitor_heart"
					href="https://grafana.davidnet.internal" />
				<HorizontalCard
					title="Traefik"
					icon="globe_book"
					href="https://traefik.davidnet.internal" />
				<HorizontalCard
					title="Longhorn"
					icon="hard_drive"
					href="https://longhorn.davidnet.internal" />
				<HorizontalCard title="VPN" icon="p2p" href="{PUBLIC_ACCOUNT_FRONTEND_URL}/internal/vpn" />
				<HorizontalCard title="ArgoCD" icon="automation" href="https://argocd.davidnet.internal" />
				<HorizontalCard title="Database" icon="database" href="https://db.davidnet.internal" />
				<HorizontalCard
					title="Internal access"
					icon="smart_card_reader"
					href="{PUBLIC_ACCOUNT_FRONTEND_URL}/internal/access" />
			</Flex>
		{/if}
	</Flex>
</Flex>
