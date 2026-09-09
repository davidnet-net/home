<script lang="ts">
	import {
		authState,
		Flex,
		whenAuthReady,
		LinkButton,
		Button,
		Icon,
		Anchor
	} from "@davidnet-net/svelte-ui";

	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { PUBLIC_ACCOUNT_FRONTEND_URL } from "$env/static/public";
	import { token } from "@davidnet-net/svelte-ui/tokens";

	let iframeElement: HTMLIFrameElement;

	$effect(() => {
		(async () => {
			await whenAuthReady();
			if (!authState.isLoggedIn && !authState.loading) {
				window.location.href = `${PUBLIC_ACCOUNT_FRONTEND_URL}/login?continue=${encodeURIComponent(page.url.href)}`;
			}
		})();
	});

	function resetGame() {
		if (iframeElement && iframeElement.contentWindow) {
			// Safely trigger a reset or reload inside the iframe if supported
			iframeElement.contentWindow.location.reload();
		}
	}

	function toggleFullscreen() {
		if (iframeElement) {
			if (iframeElement.requestFullscreen) {
				iframeElement.requestFullscreen();
			}
		}
	}
</script>

<Flex alignItems="center" marginTop="medium" direction="column" gap="medium">
	<iframe
		bind:this={iframeElement}
		sandbox="allow-scripts allow-same-origin"
		style="height: 80vh; width: 90%; border-radius: {token.global.radius.huge}; border: none;"
		src="/community_games/rocket.html"
		title="Cola fabriek">
	</iframe>
	<Flex height="fit-content" width="fit-content" gap="small">
		<LinkButton href="/games" iconbefore="arrow_back">Back</LinkButton>
		<Button onclick={resetGame} iconbefore="refresh">Reset</Button>
		<Button onclick={toggleFullscreen} iconbefore="fullscreen">Fullscreen</Button>
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
	<Flex
		width="fit-content"
		height="fit-content"
		alignItems="center"
		style="color: {token.theme.color.text.tertiary}"
		gap="xsmall"
		verticalAlign="middle">
		<Icon icon="attribution" />Game is created by <Anchor
			href="https://account.davidnet.net/profile/019fe0ad-12ca-73cb-a43b-98b5fc262382">
			@david
		</Anchor>
	</Flex>
</Flex>
