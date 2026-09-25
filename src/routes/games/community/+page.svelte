<script lang="ts">
	import { onMount } from "svelte";
	import {
		Flex,
		LinkButton,
		Spinner,
		getFetch,
		Icon,
		type iconType
	} from "@davidnet-net/svelte-ui";
	import { token } from "@davidnet-net/svelte-ui/tokens";
	import { PUBLIC_BACKEND_URL } from "$env/static/public";
	import HorizontalCard from "$lib/components/HorizontalCard/HorizontalCard.svelte";

	let apiGames = $state<any[]>([]);
	let loading = $state(true);
	let errorMessage = $state("");

	// Oude hardcoded games zonder likes of creator info
	const legacyGames = [
		{
			title: "Tower defense",
			icon: "fort",
			href: "/games/community/tower_defense",
			isLegacy: true
		},
		{
			title: "Cola fabriek",
			icon: "factory",
			href: "/games/community/cola_fabriek",
			isLegacy: true
		},
		{
			title: "Ruimte vlieger",
			icon: "rocket",
			href: "/games/community/rocket",
			isLegacy: true
		},
		{
			title: "Wobble Towers",
			icon: "bar_chart",
			href: "/games/community/wobble_towers",
			isLegacy: true
		},
		{
			title: "Crazy ape",
			icon: "pets",
			href: "/games/community/crazy_ape",
			isLegacy: true
		},
		{
			title: "Clash of kingdoms",
			icon: "swords",
			href: "/games/community/clash_of_kingdoms",
			isLegacy: true
		},
		{
			title: "Crown conflict",
			icon: "crown",
			href: "/games/community/crown_conflict",
			isLegacy: true
		}
	];

	onMount(async () => {
		try {
			const result = await getFetch(
				`${PUBLIC_BACKEND_URL}/social/community-games/feed`,
				undefined,
				{},
				true
			);
			if (result.success) {
				apiGames = result.games.map((game: any) => ({
					...game,
					icon: "extension",
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

	const allGames = $derived([...apiGames, ...legacyGames]);
</script>

<Flex alignItems="center" marginTop="giant" direction="column">
	<Flex width="90%" marginTop="giant" direction="column" gap="small">
		<Flex justifyContent="spaceBetween" height="fit-content">
			<Flex width="fit-content" height="fit-content">
				<h2 class="default-heading">Community Games:</h2>
			</Flex>

			<Flex width="fit-content" height="fit-content" gap="medium">
				<LinkButton href="/games" appearance="default" iconbefore="arrow_back">
					Back to Games
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
					<HorizontalCard title={game.title} icon={game.icon as iconType} href={game.href} />

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
