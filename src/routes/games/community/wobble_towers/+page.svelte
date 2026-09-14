<script lang="ts">
	import {
		authState,
		Flex,
		whenAuthReady,
		LinkButton,
		Button,
		Icon,
		Anchor,
		Link
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
		if (iframeElement) {
			// Re-assigning the src avoids cross-origin security errors when resetting cross-domain iframes
			const currentSrc = iframeElement.src;
			iframeElement.src = "";
			iframeElement.src = currentSrc;
		}
	}

	function toggleFullscreen() {
		if (iframeElement && iframeElement.requestFullscreen) {
			iframeElement.requestFullscreen();
		}
	}
</script>

<Flex alignItems="center" marginTop="medium" direction="column" gap="medium">
	<iframe
		bind:this={iframeElement}
		style="height: 80vh; width: 90%; border-radius: {token.global.radius.huge}; border: none;"
		src="https://design.davidnet.net/exit?href=https%3A%2F%2Fwobbletowers.gamer.gd%2F%3Fi%3D1"
		title="Wobble Towers">
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
			href="https://account.davidnet.net/profile/01a04237-349d-712c-85f9-e26ae5abbaae">
			@zandzak500 and hosted externally on <Link
				external
				opennewtab
				UNSAFE_showExitPage
				href="https://wobbletowers.gamer.gd/?i=1">
				wobbletowers.gamer.gd
			</Link>
		</Anchor>
	</Flex>
</Flex>
