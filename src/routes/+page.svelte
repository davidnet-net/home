<script lang="ts">
	import {
		appState,
		authState,
		Avatar,
		Flex,
		identityState,
		Skeleton,
		whenAuthReady
	} from "@davidnet-net/svelte-ui";
	import { token } from "@davidnet-net/svelte-ui/tokens";

	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import Card from "$lib/components/Card/Card.svelte";
	import HorizontalCard from "$lib/components/HorizontalCard/HorizontalCard.svelte";
	import { PUBLIC_ACCOUNT_FRONTEND_URL } from "$env/static/public";

	$effect(() => {
		(async () => {
			await whenAuthReady();
			if (!authState.isLoggedIn && !authState.loading) {
				goto(`${PUBLIC_ACCOUNT_FRONTEND_URL}/login?continue=${encodeURIComponent(page.url.href)}`);
			}
		})();
	});
</script>

<h1>Davidnet home</h1>
