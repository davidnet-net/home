<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { PUBLIC_ACCOUNT_FRONTEND_URL, PUBLIC_BACKEND_URL } from "$env/static/public";
	import {
		authState,
		identityState,
		whenAuthReady,
		Flex,
		LinkButton,
		Button,
		Icon,
		Anchor,
		Spinner,
		getFetch,
		deleteFetch,
		toast,
		Modal
	} from "@davidnet-net/svelte-ui";
	import { token } from "@davidnet-net/svelte-ui/tokens";

	let gameId = page.params.id;
	let gameData = $state<any>(null);
	let loading = $state(true);
	let errorMessage = $state("");

	let iframeRef: HTMLIFrameElement | undefined = $state();
	let showDeleteModal = $state(false);
	let isDeleting = $state(false);

	const isCreator = $derived(
		identityState.user?.username && gameData?.creator === identityState.user.username
	);

	$effect(() => {
		(async () => {
			await whenAuthReady();
			if (!authState.isLoggedIn && !authState.loading) {
				window.location.href = `${PUBLIC_ACCOUNT_FRONTEND_URL}/login?continue=${encodeURIComponent(page.url.href)}`;
			}
		})();
	});

	onMount(async () => {
		try {
			const result = await getFetch(
				`${PUBLIC_BACKEND_URL}/social/community-games/${gameId}`,
				undefined,
				{},
				true
			);
			if (result.success) {
				gameData = result.game;
			} else {
				errorMessage = "Game not found.";
			}
		} catch (err) {
			errorMessage = "Failed to load game data.";
		} finally {
			loading = false;
		}
	});

	function resetGame() {
		if (iframeRef) {
			iframeRef.src = iframeRef.src;
		}
	}

	function toggleFullscreen() {
		if (iframeRef) {
			if (iframeRef.requestFullscreen) {
				iframeRef.requestFullscreen();
			}
		}
	}

	async function executeDelete() {
		isDeleting = true;
		try {
			const result = await deleteFetch(
				`${PUBLIC_BACKEND_URL}/social/community-games/${gameId}`,
				undefined,
				{},
				true
			);
			if (result.success) {
				toast("Deleted", "Game has been deleted.", "delete", 4000, "success");
				goto("/games/community");
			} else {
				toast("Error", "Could not delete game.", "error", 4000, "danger");
			}
		} catch (err) {
			toast("Error", "Network error.", "error", 4000, "danger");
		} finally {
			isDeleting = false;
			showDeleteModal = false;
		}
	}
</script>

{#if showDeleteModal}
	<Modal title="Delete Game" onclose={() => (showDeleteModal = false)}>
		<p>
			Are you sure you want to permanently delete <strong>{gameData?.title}</strong>
			? This cannot be undone.
		</p>

		{#snippet actions()}
			<Flex gap="small" justifyContent="end">
				<Button appearance="default" onclick={() => (showDeleteModal = false)}>Cancel</Button>
				<Button appearance="danger" loading={isDeleting} onclick={executeDelete}>
					Delete permanently
				</Button>
			</Flex>
		{/snippet}
	</Modal>
{/if}

<Flex alignItems="center" marginTop="medium" marginBottom="giant" direction="column" gap="medium">
	{#if loading}
		<Flex justifyContent="center" alignItems="center" height="70vh">
			<Spinner size="large" />
		</Flex>
	{:else if errorMessage}
		<Flex direction="column" alignItems="center" gap="medium" marginTop="giant">
			<p style="color: {token.theme.color.text.danger}">{errorMessage}</p>
			<LinkButton href="/games/community" iconbefore="arrow_back">Back</LinkButton>
		</Flex>
	{:else if gameData}
		<iframe
			bind:this={iframeRef}
			sandbox="allow-scripts allow-same-origin"
			style="height: 75vh; width: 90%; border: 2px solid {token.theme.color.border
				.default}; border-radius: {token.global.radius.huge}; background: #000;"
			src="{PUBLIC_BACKEND_URL}/social/community-games/{gameId}/file/index.html"
			title={gameData.title}>
		</iframe>

		<Flex direction="column" alignItems="center" gap="small" width="90%">
			<Flex height="fit-content" width="fit-content" gap="small" justifyContent="center">
				<LinkButton href="/games/community" appearance="default" iconbefore="arrow_back">
					Back
				</LinkButton>
				<Button onclick={resetGame} iconbefore="refresh">Reset</Button>
				<Button onclick={toggleFullscreen} iconbefore="fullscreen">Fullscreen</Button>

				{#if isCreator}
					<Button appearance="danger" onclick={() => (showDeleteModal = true)} iconbefore="delete">
						Delete
					</Button>
				{/if}
			</Flex>

			<Flex
				width="fit-content"
				height="fit-content"
				alignItems="center"
				justifyContent="center"
				style="color: {token.theme.color.text.tertiary}"
				gap="xsmall">
				<Icon icon="attribution" />
				<span>
					Game is created by
					<Anchor href="{PUBLIC_ACCOUNT_FRONTEND_URL}/profile/{gameData.creator}">
						@{gameData.creator}
					</Anchor>
				</span>
			</Flex>

			{#if gameData.description}
				<p
					style="color: {token.theme.color.text
						.secondary}; max-width: 600px; margin: 0; text-align: center;">
					{gameData.description}
				</p>
			{/if}
		</Flex>
	{/if}
</Flex>
