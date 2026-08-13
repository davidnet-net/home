<script lang="ts">
	import {
		authState,
		Flex,
		whenAuthReady,
		LinkButton,
		Button,
		Icon
	} from "@davidnet-net/svelte-ui";

	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { PUBLIC_ACCOUNT_FRONTEND_URL } from "$env/static/public";
	import { token } from "@davidnet-net/svelte-ui/tokens";

	$effect(() => {
		(async () => {
			await whenAuthReady();
			if (!authState.isLoggedIn && !authState.loading) {
				goto(`${PUBLIC_ACCOUNT_FRONTEND_URL}/login?continue=${encodeURIComponent(page.url.href)}`);
			}
		})();
	});
</script>

<Flex alignItems="center" marginTop="medium" direction="column" gap="medium">
	<div style="height: 90%; width: 90%; border-radius: {token.global.radius.huge};"></div>
	<Flex height="fit-content" width="fit-content" gap="small">
		<LinkButton href="/games" iconbefore="arrow_back">Back</LinkButton>
		<Button onclick={() => {}} iconbefore="refresh">Reset</Button>
		<Button onclick={() => {}} iconbefore="fullscreen">Fullscreen</Button>
	</Flex>
	<Flex
		width="fit-content"
		height="fit-content"
		alignItems="center"
		style="color: {token.theme.color.text.tertiary}"
		gap="xsmall"
		verticalAlign="middle">
		<Icon icon="star_shine" />Game is generated with AI!
	</Flex>
</Flex>
