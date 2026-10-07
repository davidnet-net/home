<script lang="ts">
	import { onMount } from "svelte";
	import {
		Anchor,
		authState,
		Flex,
		Icon,
		LinkButton,
		Spinner,
		getFetch,
		whenAuthReady
	} from "@davidnet-net/svelte-ui";
	import { token } from "@davidnet-net/svelte-ui/tokens";
	import { PUBLIC_ACCOUNT_FRONTEND_URL, PUBLIC_BACKEND_URL } from "$env/static/public";
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

	type Achievement = {
		gameId: string;
		gameTitle: string;
		gameIconFilename: string | null;
		achievementId: string;
		name: string;
		description: string | null;
		icon: string | null;
		unlockedAt: string;
	};

	let achievements = $state<Achievement[]>([]);
	let loading = $state(true);
	let errorMessage = $state("");
	let totalPlaytimeMs = $state(0);
	let loadingPlaytime = $state(true);

	function gameIconUrl(a: Achievement): string | undefined {
		return a.gameIconFilename
			? `${PUBLIC_BACKEND_URL}/social/community-games/${a.gameId}/file/${a.gameIconFilename}`
			: undefined;
	}

	function formatPlaytime(ms: number): string {
		const totalMinutes = Math.floor(ms / 60000);
		const hours = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes % 60;
		return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
	}

	onMount(async () => {
		await whenAuthReady();
		try {
			const result = await getFetch(
				`${PUBLIC_BACKEND_URL}/social/community-games/achievements/mine`,
				undefined,
				{},
				true
			);

			if (checkBanResponse(result)) return;

			if (result.success) {
				achievements = result.achievements;
			} else {
				errorMessage = "Failed to load your achievements.";
			}
		} catch (err) {
			errorMessage = "Network error while fetching achievements.";
		} finally {
			loading = false;
		}

		try {
			const playtimeResult = await getFetch(
				`${PUBLIC_BACKEND_URL}/social/community-games/playtime/total`,
				undefined,
				{},
				true
			);
			if (playtimeResult.success) {
				totalPlaytimeMs = playtimeResult.totalPlaytimeMs ?? 0;
			}
		} catch (err) {
			// Silently ignore - the rest of the page still works without this stat.
		} finally {
			loadingPlaytime = false;
		}
	});

	const gamesUnlockedIn = $derived(new Set(achievements.map((a) => a.gameId)).size);
</script>

<Flex alignItems="center" marginTop="giant" direction="column">
	<Flex width="90%" marginTop="giant" direction="column" gap="small">
		<Flex justifyContent="spaceBetween" height="fit-content" alignItems="center" flexWrap="wrap">
			<Flex width="fit-content" height="fit-content" direction="column" gap="xsmall">
				<h2 class="default-heading">My Achievements</h2>
				{#if !loading && !errorMessage}
					<span style="color: {token.theme.color.text.tertiary}; font-size: 0.9rem;">
						{achievements.length}
						{achievements.length === 1 ? "achievement" : "achievements"} unlocked across {gamesUnlockedIn}
						{gamesUnlockedIn === 1 ? "game" : "games"}
					</span>
				{/if}
				{#if !loadingPlaytime}
					<span style="color: {token.theme.color.text.tertiary}; font-size: 0.9rem;">
						⏱️ {formatPlaytime(totalPlaytimeMs)} total playtime across all community games
					</span>
				{/if}
			</Flex>

			<LinkButton href="/games/community" appearance="default" iconbefore="arrow_back">
				Back to Community Games
			</LinkButton>
		</Flex>

		{#if loading}
			<Flex justifyContent="center" marginTop="giant">
				<Spinner size="large" />
			</Flex>
		{:else if errorMessage}
			<p style="color: {token.theme.color.text.danger}">{errorMessage}</p>
		{:else if achievements.length === 0}
			<Flex
				direction="column"
				alignItems="center"
				gap="small"
				marginTop="giant"
				marginBottom="giant"
				style="color: {token.theme.color.text.tertiary}">
				<Icon icon="military_tech" size="huge" />
				<p>No achievements yet. Go play some community games!</p>
			</Flex>
		{:else}
			<Flex gap="medium" height="fit-content" marginBottom="giant" flexWrap="wrap">
				{#each achievements as a (a.gameId + ":" + a.achievementId)}
					<div
						style="
							width: 320px;
							display: flex;
							gap: 12px;
							padding: 16px;
							background: {token.theme.color.surface.raised};
							border: 1px solid {token.theme.color.border.default};
							border-radius: {token.global.radius.large};
							box-sizing: border-box;
						">
						<div
							style="
								flex-shrink: 0;
								width: 48px;
								height: 48px;
								display: flex;
								align-items: center;
								justify-content: center;
								font-size: 1.6rem;
								background: {token.theme.color.surface.sunken};
								border-radius: {token.global.radius.medium};
							">
							{#if a.icon}
								{a.icon}
							{:else}
								<Icon icon="military_tech" />
							{/if}
						</div>

						<Flex direction="column" gap="xsmall" style="min-width: 0; flex: 1;">
							<span style="font-weight: bold; overflow-wrap: break-word;">{a.name}</span>
							{#if a.description}
								<span style="color: {token.theme.color.text.secondary}; font-size: 0.85rem;">
									{a.description}
								</span>
							{/if}

							<Flex
								alignItems="center"
								gap="xsmall"
								marginTop="xsmall"
								style="color: {token.theme.color.text.tertiary}; font-size: 0.8rem;">
								{#if gameIconUrl(a)}
									<img
										src={gameIconUrl(a)}
										alt=""
										style="width: 16px; height: 16px; border-radius: {token.global.radius
											.small}; object-fit: cover;" />
								{:else}
									<Icon icon="extension" size="small" />
								{/if}
								<Anchor href="/games/community/player/{a.gameId}">{a.gameTitle}</Anchor>
							</Flex>

							<span style="color: {token.theme.color.text.tertiary}; font-size: 0.75rem;">
								Unlocked {new Date(a.unlockedAt).toLocaleDateString()}
							</span>
						</Flex>
					</div>
				{/each}
			</Flex>
		{/if}
	</Flex>
</Flex>

<style>
	.default-heading {
		transition: font-size 0.5s ease;
	}
</style>
