<script lang="ts">
	import { onMount } from "svelte";
	import {
		Flex,
		LinkButton,
		Spinner,
		getFetch,
		Icon,
		type iconType,
		deleteCookie,
		Button,
		sleep,
		whenAuthReady,
		authState
	} from "@davidnet-net/svelte-ui";
	import { token } from "@davidnet-net/svelte-ui/tokens";
	import { PUBLIC_ACCOUNT_FRONTEND_URL, PUBLIC_BACKEND_URL } from "$env/static/public";
	import HorizontalCard from "$lib/components/HorizontalCard/HorizontalCard.svelte";
	import { page } from "$app/state";

	// --- Ban status check ---
	async function checkUserBanStatus() {
		if (!authState.isLoggedIn) return;
		try {
			const res = await getFetch(
				`${PUBLIC_BACKEND_URL}/support/moderation/me/ban-status`,
				{},
				undefined,
				true
			);
			if (res.code === "BANNED" || (res.success && res.isBanned)) {
				window.location.href = `https://davidnet.net/moderation/banned?until=${encodeURIComponent(res.bannedUntil)}`;
			}
		} catch (err) {
			console.error("Failed to check ban status:", err);
		}
	}

	function checkBanResponse(res: any) {
		if (res && res.code === "BANNED") {
			window.location.href = `https://davidnet.net/moderation/banned?until=${encodeURIComponent(res.bannedUntil)}`;
			return true;
		}
		return false;
	}

	$effect(() => {
		(async () => {
			await whenAuthReady();
			if (!authState.isLoggedIn && !authState.loading) {
				window.location.href = `${PUBLIC_ACCOUNT_FRONTEND_URL}/login?continue=${encodeURIComponent(page.url.href)}`;
			} else {
				await checkUserBanStatus();
			}
		})();
	});

	let apiGames = $state<any[]>([]);
	let loading = $state(true);
	let errorMessage = $state("");

	onMount(async () => {
		await whenAuthReady();
		try {
			const result = await getFetch(
				`${PUBLIC_BACKEND_URL}/social/community-games/feed`,
				undefined,
				{},
				true
			);

			if (checkBanResponse(result)) return;

			if (result.success) {
				apiGames = result.games.map((game: any) => ({
					...game,
					icon: "extension",
					iconUrl: game.iconFilename
						? `${PUBLIC_BACKEND_URL}/social/community-games/${game.id}/file/${game.iconFilename}`
						: undefined,
					href: `/games/community/player/${game.id}`,
					isLegacy: false
				}));
			} else {
				errorMessage = "Failed to load dynamic community games.";
			}
		} catch (err) {
			errorMessage = "Network error while fetching games.";
		} finally {
			loading = false;
		}
	});

	const allGames = $derived(apiGames);
</script>

<Flex alignItems="center" marginTop="giant" direction="column">
	<Flex width="90%" marginTop="giant" direction="column" gap="small">
		<Flex justifyContent="spaceBetween" height="fit-content">
			<Flex width="fit-content" height="fit-content">
				<h2 class="default-heading">Community Games:</h2>
			</Flex>

			<Flex width="fit-content" height="fit-content" gap="medium">
				<LinkButton href="/games" appearance="default" iconbefore="history">
					Legacy Games
				</LinkButton>
				<LinkButton
					href="/games/community/achievements"
					appearance="default"
					iconbefore="military_tech">
					My Achievements
				</LinkButton>
				<LinkButton href="/games/community/upload" appearance="primary" iconbefore="upload">
					Upload Game
				</LinkButton>
			</Flex>
		</Flex>

		{#if loading}
			<Flex justifyContent="center" marginTop="giant">
				<Spinner size="large" />
			</Flex>
		{:else if errorMessage && apiGames.length === 0}
			<p style="color: {token.theme.color.text.danger}">{errorMessage}</p>
		{/if}

		<Flex gap="medium" height="fit-content" marginBottom="giant" flexWrap="wrap">
			{#each allGames as game}
				<div style="width: 300px;">
					<HorizontalCard
						title={game.title}
						icon={game.icon as iconType}
						imageUrl={game.iconUrl}
						href={game.href} />

					{#if !game.isLegacy}
						<Flex
							alignItems="center"
							gap="xsmall"
							marginTop="xsmall"
							style="color: {token.theme.color.text.tertiary}; font-size: 0.85rem;">
							<Icon icon="person" size="small" />
							<span>By @{game.creator}</span>
							<span style="margin-left: auto;">
								<Icon icon="favorite" size="small" />
								{game.likesCount}
							</span>
						</Flex>
					{/if}
				</div>
			{/each}
		</Flex>
	</Flex>
</Flex>

<style>
	.default-heading {
		transition: font-size 0.5s ease;
	}
</style>
