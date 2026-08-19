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
		LinkButton
	} from "@davidnet-net/svelte-ui";
	import { token } from "@davidnet-net/svelte-ui/tokens";

	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import Card from "$lib/components/Card/Card.svelte";
	import HorizontalCard from "$lib/components/HorizontalCard/HorizontalCard.svelte";
	import { PUBLIC_ACCOUNT_FRONTEND_URL } from "$env/static/public";
	import * as styles from "./page.css.ts";
	import gamepadIcon from "$lib/assets/gamepad.svg";

	let currentTime = $state(Date.now());
	let isMounted = $state(false);

	$effect(() => {
		isMounted = true;
	});

	$effect(() => {
		(async () => {
			await whenAuthReady();
			if (!authState.isLoggedIn && !authState.loading) {
				window.location.href = `${PUBLIC_ACCOUNT_FRONTEND_URL}/login?continue=${encodeURIComponent(page.url.href)}`;
			}
		})();
	});

	$effect(() => {
		if (typeof window === "undefined") return;

		let interval: NodeJS.Timeout | null = null;

		const updateClock = () => {
			if (document.visibilityState === "visible") {
				currentTime = Date.now();
			}
		};

		const startTimer = () => {
			if (!interval) {
				interval = setInterval(updateClock, 1000);
			}
		};

		const stopTimer = () => {
			if (interval) {
				clearInterval(interval);
				interval = null;
			}
		};

		startTimer();

		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				currentTime = Date.now();
				startTimer();
			} else {
				stopTimer();
			}
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			stopTimer();
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	});

	function getGreeting(): string {
		const hour = new Date(currentTime).getHours();
		if (hour < 6) {
			return "Good night";
		} else if (hour < 12) {
			return "Good morning";
		} else if (hour < 18) {
			return "Good afternoon";
		} else if (hour < 22) {
			return "Good evening";
		} else {
			return "Good night";
		}
	}
</script>

<Flex alignItems="center" marginTop="giant" direction="column">
	<div
		class={styles.banner}
		style="position: relative; overflow: hidden; max-width: 100%; box-sizing: border-box;">
		<Flex justifyContent="spaceBetween" alignItems="start" padding="medium">
			<div style="position: relative; z-index: 1;">
				<h1 style="padding: 0px; margin: 0px; font-size: {token.global.font.size.large};">
					{getGreeting()},
				</h1>
				<p
					style="font-size: {token.global.font.size.large}; margin-bottom: {token.global.spacing
						.large}">
					{identityState.user?.displayName}
				</p>
				<p style="color: {token.theme.color.text.secondary}">
					{#if isMounted}
						{formatUnixMsToPreferred(currentTime, true)}
					{:else}
						Loading time...
					{/if}
				</p>
			</div>

			<div
				style="position: absolute; right: -7rem; bottom: -5rem; z-index: 0; pointer-events: none; opacity: 0.85;">
				<img
					src={gamepadIcon}
					alt=""
					aria-hidden="true"
					style="height: 20rem; width: auto; display: block; transform: rotate(40deg);" />
			</div>
			<LinkButton iconafter="arrow_forward" appearance="subtle" href="/games">
				Play a game
			</LinkButton>
		</Flex>
	</div>
	<Flex width="90%" marginTop="giant" direction="column" gap="small">
		<Flex justifyContent="spaceBetween" height="fit-content">
			<h2>Apps:</h2>
			<LinkButton href="/apps" iconafter="arrow_forward">All apps</LinkButton>
		</Flex>
		<Flex gap="medium" height="fit-content" marginBottom="giant" flexWrap="wrap">
			<HorizontalCard
				title="Account"
				description=""
				icon="for_you"
				href={PUBLIC_ACCOUNT_FRONTEND_URL} />
			<HorizontalCard title="Docs" description="" icon="docs" href="https://docs.davidnet.net" />
			<HorizontalCard
				title="Kanban"
				description=""
				icon="view_kanban"
				href="https://kanban.davidnet.net" />
			<HorizontalCard title="Quiz" description="" icon="quiz" href="https://quiz.davidnet.net" />
		</Flex>
		<h2>Recent:</h2>
		<p style="color: {token.theme.color.text.secondary}">
			No recent things, boards, docs and other things you visit will show up here.
		</p>
	</Flex>
</Flex>
