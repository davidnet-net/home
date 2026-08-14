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
		LinkButton,
		getFetch,
		sleep,
		IconButton,
		toast,
		Spinner
	} from "@davidnet-net/svelte-ui";
	import { token } from "@davidnet-net/svelte-ui/tokens";

	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import HorizontalCard from "$lib/components/HorizontalCard/HorizontalCard.svelte";
	import { PUBLIC_ACCOUNT_FRONTEND_URL, PUBLIC_BACKEND_URL } from "$env/static/public";
	import Confetti from "svelte-confetti";

	$effect(() => {
		(async () => {
			await whenAuthReady();
			if (!authState.isLoggedIn && !authState.loading) {
				goto(`${PUBLIC_ACCOUNT_FRONTEND_URL}/login?continue=${encodeURIComponent(page.url.href)}`);
			}
		})();
	});

	let confetti = $state(false);
	let confettiClickCount = $state(0);

	let permanentDisco = $state(false);
	let totalChaos = $state(false);
	let gravityOut = $state(false);
	let confettiBtnRef: HTMLDivElement;

	let buttonScale = $state(1);
	let confettiKey = $state(0);
	let buttonDisabled = $state(false);

	let wildIntervals: any[] = [];
	let rebuilding = $state(false);

	$effect(() => {
		if (permanentDisco && !gravityOut) {
			const interval = setInterval(() => {
				confettiKey += 1;
			}, 1500);
			return () => clearInterval(interval);
		}
	});

	function goWild(el: HTMLElement | null) {
		if (!el || el.dataset.wild === "true") return;
		el.dataset.wild = "true";

		const rect = el.getBoundingClientRect();
		const startLeft = rect.left;
		const startTop = rect.top;
		const elWidth = rect.width || 150;
		const elHeight = rect.height || 50;

		el.style.transition = "transform 0.8s cubic-bezier(0.45, 0, 0.55, 1)";
		el.style.zIndex = "9999";

		const intervalId = setInterval(() => {
			const maxSafeX = window.innerWidth - elWidth - 40;
			const maxSafeY = window.innerHeight - elHeight - 40;

			const targetAbsoluteX = Math.max(20, Math.random() * maxSafeX);
			const targetAbsoluteY = Math.max(20, Math.random() * maxSafeY);

			const moveX = targetAbsoluteX - startLeft;
			const moveY = targetAbsoluteY - startTop;

			const randomRot = (Math.random() - 0.5) * 720;
			const randomScale = 0.3 + Math.random() * 1.7;

			el.style.transform = `translate(${moveX}px, ${moveY}px) rotate(${randomRot}deg) scale(${randomScale})`;
		}, 800);

		wildIntervals.push(intervalId);
	}

	function makeWild(node: HTMLElement) {
		goWild(node);
	}

	function resetAll() {
		confettiClickCount = 0;
		buttonScale = 1;
		permanentDisco = false;
		totalChaos = false;
		gravityOut = false;
		confetti = false;

		wildIntervals.forEach(clearInterval);
		wildIntervals = [];

		const items = document.querySelectorAll(".physics-item") as NodeListOf<HTMLElement>;
		items.forEach((el) => {
			el.dataset.wild = "false";
			el.style.transform = "";
			el.style.transition = "";
			el.style.zIndex = "";
		});
	}

	async function activateConfetti() {
		if (buttonDisabled) return;
		buttonDisabled = true;

		confettiClickCount += 1;

		if (confettiClickCount < 7) {
			buttonScale += 0.3;
		}

		// 5th click: Just the button goes wild
		if (confettiClickCount === 5) {
			permanentDisco = true;
			confetti = true;
			goWild(confettiBtnRef);
			buttonDisabled = false;
			return;
		}

		// 6th click: Total Chaos kicks in
		if (confettiClickCount === 6) {
			totalChaos = true;
			const items = document.querySelectorAll(".physics-item") as NodeListOf<HTMLElement>;
			items.forEach((el) => goWild(el));
			buttonDisabled = false;
			return;
		}

		// 7th click: Gravity takes over, everything falls
		if (confettiClickCount === 7) {
			gravityOut = true;

			// Stop flying
			wildIntervals.forEach(clearInterval);
			wildIntervals = [];

			// Drop everything
			const items = document.querySelectorAll(".physics-item") as NodeListOf<HTMLElement>;
			items.forEach((el) => {
				el.dataset.wild = "false";
				el.style.transition = "transform 2s cubic-bezier(0.55, 0.085, 0.68, 0.53)";
				el.style.transform = `translateY(${window.innerHeight + 400}px) rotate(${(Math.random() - 0.5) * 180}deg)`;
			});

			// Wait 5 seconds, reset
			rebuilding = true;
			await sleep(5000);
			rebuilding = false;
			resetAll();
			buttonDisabled = false;
			return;
		}

		// First 4 clicks standard logic
		if (confettiClickCount < 5) {
			confetti = true;
			await sleep(4000);
			if (!permanentDisco) {
				confetti = false;
			}
		}

		buttonDisabled = false;
	}
</script>

{#if confetti || permanentDisco}
	<div
		style="position: fixed; top: -50px; left: 0; height: 100vh; width: 100vw; display: flex; justify-content: center; overflow: hidden; pointer-events: none; z-index: 9999;">
		{#key confettiKey}
			<Confetti
				x={[-5, 5]}
				y={[0, 0.1]}
				delay={[0, 500]}
				duration={2000}
				amount={200}
				fallDistance="100vh" />
		{/key}
	</div>
{/if}

{#if totalChaos && !gravityOut}
	{#each [1, 2, 3] as i}
		<div
			use:makeWild
			class="physics-item"
			style="position: fixed; top: 40%; left: 40%; z-index: 10000; pointer-events: none;">
			<h2 class="temp-disco" style="font-size: 3.5rem; text-align: center;">
				Davidnet speel eiland!
			</h2>
		</div>
	{/each}
{/if}

{#if rebuilding}
	<Flex justifyContent="center" alignItems="center" gap="large" direction="column">
		<h2 class="global-disco" style="font-size: 3.5rem; text-align: center;">
			Davidnet speel eiland!
		</h2>
		<Spinner size="huge" />
	</Flex>
{/if}
<div class:global-disco={permanentDisco} class:shake-screen={totalChaos && !gravityOut}>
	<Flex alignItems="center" marginTop="giant" direction="column">
		<Flex width="90%" marginTop="giant" direction="column" gap="small">
			<Flex justifyContent="spaceBetween" height="fit-content">
				<Flex width="fit-content" height="fit-content" gap="medium">
					<div class="physics-item">
						{#if confetti || permanentDisco}
							<h2
								class="temp-disco"
								style={permanentDisco
									? "font-size: 3.5rem; transition: font-size 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);"
									: "transition: font-size 0.5s ease;"}>
								Davidnet speel eiland!
							</h2>
						{:else}
							<h2 style="transition: font-size 0.5s ease;">Games:</h2>
						{/if}
					</div>
				</Flex>

				<Flex width="fit-content" height="fit-content" gap="medium">
					<div class="physics-item" bind:this={confettiBtnRef}>
						<div
							style="transform: scale({buttonScale}); transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); transform-origin: center;">
							<IconButton
								disabled={buttonDisabled}
								appearance="default"
								icon="celebration"
								tip="Confetti"
								onclick={activateConfetti} />
						</div>
					</div>
					<div class="physics-item">
						<LinkButton href="/" appearance="primary" iconbefore="arrow_back">Back</LinkButton>
					</div>
				</Flex>
			</Flex>

			<Flex gap="medium" height="fit-content" marginBottom="giant" flexWrap="wrap">
				<div class="physics-item">
					<HorizontalCard
						title="Roll 'N Dodge"
						icon="sports_martial_arts"
						href="/games/roll_dodge/" />
				</div>
				<div class="physics-item">
					<HorizontalCard title="Tower grappler" icon="phishing" href="/games/tower_grappler/" />
				</div>
				<div class="physics-item">
					<HorizontalCard title="Tower stacker" icon="stacks" href="/games/tower_stacker/" />
				</div>
				<div class="physics-item">
					<HorizontalCard title="Portal runner" icon="sprint" href="/games/portal_runner/" />
				</div>
				<div class="physics-item">
					<HorizontalCard title="Mini golf" icon="golf_course" href="/games/golf/" />
				</div>
			</Flex>
		</Flex>
	</Flex>
</div>

<style>
	@keyframes ultraDisco {
		0% {
			color: #ff0055;
			filter: drop-shadow(0 0 3px rgba(255, 0, 85, 0.4));
		}
		20% {
			color: #ffae00;
			filter: drop-shadow(0 0 3px rgba(255, 174, 0, 0.4));
		}
		40% {
			color: #00ff66;
			filter: drop-shadow(0 0 3px rgba(0, 255, 102, 0.4));
		}
		60% {
			color: #00e1ff;
			filter: drop-shadow(0 0 3px rgba(0, 225, 255, 0.4));
		}
		80% {
			color: #b700ff;
			filter: drop-shadow(0 0 3px rgba(183, 0, 255, 0.4));
		}
		100% {
			color: #ff0055;
			filter: drop-shadow(0 0 3px rgba(255, 0, 85, 0.4));
		}
	}

	@keyframes screenShake {
		0% {
			transform: translate(1px, 1px) rotate(0deg);
		}
		10% {
			transform: translate(-1px, -2px) rotate(-1deg);
		}
		20% {
			transform: translate(-3px, 0px) rotate(1deg);
		}
		30% {
			transform: translate(3px, 2px) rotate(0deg);
		}
		40% {
			transform: translate(1px, -1px) rotate(1deg);
		}
		50% {
			transform: translate(-1px, 2px) rotate(-1deg);
		}
		60% {
			transform: translate(-3px, 1px) rotate(0deg);
		}
		70% {
			transform: translate(3px, 1px) rotate(-1deg);
		}
		80% {
			transform: translate(-1px, -1px) rotate(1deg);
		}
		90% {
			transform: translate(1px, 2px) rotate(0deg);
		}
		100% {
			transform: translate(1px, -2px) rotate(-1deg);
		}
	}

	.temp-disco {
		animation: ultraDisco 1.5s infinite linear !important;
	}

	/* Animate everything but strictly exclude icons from the Comic Sans override */
	:global(.global-disco *) {
		animation: ultraDisco 1.5s infinite linear !important;
		border-color: currentColor !important;
	}

	/* Target text elements but ignore any element with "icon" in the class, <i> tags, and SVGs */
	:global(.global-disco *:not([class*="icon"]):not(i):not(svg)) {
		font-family: "Comic Sans MS", "Comic Sans", cursive !important;
	}

	.shake-screen {
		animation: screenShake 0.4s infinite linear !important;
		overflow: visible;
	}

	.physics-item {
		display: inline-block;
		width: fit-content;
		height: fit-content;
		transform: translate(0, 0) rotate(0) scale(1);
	}
</style>
