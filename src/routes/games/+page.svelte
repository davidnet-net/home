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

	$effect(() => {
		(async () => {
			await whenAuthReady();
			if (!authState.isLoggedIn && !authState.loading) {
				goto(`${PUBLIC_ACCOUNT_FRONTEND_URL}/login?continue=${encodeURIComponent(page.url.href)}`);
			}
		})();
	});
</script>

<Flex alignItems="center" marginTop="giant" direction="column">
	<Flex width="90%" marginTop="giant" direction="column" gap="small">
		<Flex justifyContent="spaceBetween" height="fit-content">
			<h2>Games:</h2>
			<LinkButton href="/" appearance="primary" iconbefore="arrow_back">Back</LinkButton>
		</Flex>
		<Flex gap="medium" height="fit-content" marginBottom="giant" flexWrap="wrap">
			<HorizontalCard title="Roll 'N Dodge" icon="sports_martial_arts" href="/games/roll_dodge/" />
			<HorizontalCard title="Tower grappler" icon="phishing" href="/games/tower_grappler/" />
			<HorizontalCard title="Tower stacker" icon="stacks" href="/games/tower_stacker/" />
			<HorizontalCard title="Portal runner" icon="sprint" href="/games/portal_runner/" />
			<HorizontalCard title="Mini golf" icon="golf_course" href="/games/golf/" />
		</Flex>
	</Flex>
</Flex>
