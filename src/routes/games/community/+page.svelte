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

	// Oude hardcoded games met een vastgestelde href die de router pakt
	const legacyGames = [
		{
			title: "Tower defense",
			icon: "fort",
			href: "/games/community/tower_defense",
			creator: "Legacy API",
			likesCount: 0
		},
		{
			title: "Cola fabriek",
			icon: "factory",
			href: "/games/community/cola_fabriek",
			creator: "Legacy API",
			likesCount: 0
		},
		{
			title: "Ruimte vlieger",
			icon: "rocket",
			href: "/games/community/rocket",
			creator: "Legacy API",
			likesCount: 0
		},
		{
			title: "Wobble Towers",
			icon: "bar_chart",
			href: "/games/community/wobble_towers",
			creator: "Legacy API",
			likesCount: 0
		},
		{
			title: "Crazy ape",
			icon: "pets",
			href: "/games/community/crazy_ape",
			creator: "Legacy API",
			likesCount: 0
		},
		{
			title: "Clash of kingdoms",
			icon: "swords",
			href: "/games/community/clash_of_kingdoms",
			creator: "Legacy API",
			likesCount: 0
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
				// Map de dynamische games om een href veld te hebben
				apiGames = result.games.map((game: any) => ({
					...game,
					icon: "extension",
					href: `/games/community/player/${game.id}`
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
	<Flex width="90%" marginTop="giant" direction="column" gap="medium">
		<Flex justifyContent="spaceBetween" alignItems="center">
			<h2>Community Games</h2>
			<Flex gap="small">
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
				</div>
			{/each}
		</Flex>
	</Flex>
</Flex>
