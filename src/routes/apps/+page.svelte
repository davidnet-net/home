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
	import * as m from "$lib/paraglide/messages.js";

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
				window.location.href = `${PUBLIC_ACCOUNT_FRONTEND_URL}/login?continue=${encodeURIComponent(page.url.href)}`;
			}
			loadData();
		})();
	});
</script>

<Flex alignItems="center" marginTop="giant" direction="column">
	<Flex width="90%" marginTop="giant" direction="column" gap="small">
		<Flex justifyContent="spaceBetween" height="fit-content">
			<h2>{m.common_apps_heading()}</h2>
			<LinkButton href="/" appearance="primary" iconbefore="arrow_back">{m.common_back()}</LinkButton>
		</Flex>
		<Flex gap="medium" height="fit-content" marginBottom="giant" flexWrap="wrap">
			<HorizontalCard
				title={m.page_apps_card_account_title()}
				description=""
				icon="for_you"
				href={PUBLIC_ACCOUNT_FRONTEND_URL} />
			<HorizontalCard
				title={m.page_apps_card_docs_title()}
				description=""
				icon="docs"
				href="https://docs.davidnet.net" />
			<HorizontalCard
				title={m.page_apps_card_kanban_title()}
				description=""
				icon="view_kanban"
				href="https://kanban.davidnet.net" />
			<HorizontalCard
				title={m.page_apps_card_quiz_title()}
				description=""
				icon="quiz"
				href="https://quiz.davidnet.net" />
			<HorizontalCard
				title={m.page_apps_card_social_title()}
				description=""
				icon="emoji_people"
				href="https://social.davidnet.net" />
		</Flex>
		<Flex justifyContent="spaceBetween" height="fit-content">
			<h2>{m.page_apps_links_heading()}</h2>
		</Flex>
		<Flex gap="medium" height="fit-content" marginBottom="giant" flexWrap="wrap">
			<HorizontalCard
				title={m.page_apps_card_privacy_title()}
				description=""
				icon="policy"
				href="https://davidnet.net/legal" />
			<HorizontalCard
				title={m.page_apps_card_help_title()}
				icon="contact_support"
				href="https://davidnet.net/help" />
			<HorizontalCard title={m.page_apps_card_davidnet_title()} icon="globe" href="https://davidnet.net" />
		</Flex>
		{#if internalAccessResult}
			<Flex justifyContent="spaceBetween" height="fit-content">
				<h2>{m.page_apps_internal_heading()}</h2>
			</Flex>
			<Flex gap="medium" height="fit-content" marginBottom="giant" flexWrap="wrap">
				<HorizontalCard
					title={m.page_apps_card_grafana_title()}
					description=""
					icon="monitor_heart"
					href="https://grafana.davidnet.internal" />
				<HorizontalCard
					title={m.page_apps_card_traefik_title()}
					icon="globe_book"
					href="https://traefik.davidnet.internal" />
				<HorizontalCard
					title={m.page_apps_card_longhorn_title()}
					icon="hard_drive"
					href="https://longhorn.davidnet.internal" />
				<HorizontalCard
					title={m.page_apps_card_vpn_title()}
					icon="p2p"
					href="{PUBLIC_ACCOUNT_FRONTEND_URL}/internal/vpn" />
				<HorizontalCard
					title={m.page_apps_card_argocd_title()}
					icon="automation"
					href="https://argocd.davidnet.internal" />
				<HorizontalCard
					title={m.page_apps_card_database_title()}
					icon="database"
					href="https://db.davidnet.internal" />
				<HorizontalCard
					title={m.page_apps_card_internal_access_title()}
					icon="smart_card_reader"
					href="{PUBLIC_ACCOUNT_FRONTEND_URL}/internal/access" />
			</Flex>
		{/if}
	</Flex>
</Flex>
