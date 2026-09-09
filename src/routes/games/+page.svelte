<script lang="ts">
	import {
		authState,
		whenAuthReady,
		Flex,
		IconButton,
		LinkButton,
		Spinner,
		sleep,
		type iconType,
		toast
	} from "@davidnet-net/svelte-ui";

	import { page } from "$app/state";
	import HorizontalCard from "$lib/components/HorizontalCard/HorizontalCard.svelte";
	import { PUBLIC_ACCOUNT_FRONTEND_URL } from "$env/static/public";
	import Confetti from "svelte-confetti";

	// Authentication Guard
	$effect(() => {
		(async () => {
			await whenAuthReady();
			if (!authState.isLoggedIn && !authState.loading) {
				window.location.href = `${PUBLIC_ACCOUNT_FRONTEND_URL}/login?continue=${encodeURIComponent(page.url.href)}`;
			}
		})();
	});

	// Chaos & Animation State
	let confetti = $state(false);
	let permanentDisco = $state(false);
	let totalChaos = $state(false);
	let gravityOut = $state(false);
	let rebuilding = $state(false);

	let confettiClickCount = $state(0);
	let buttonScale = $state(1);
	let confettiKey = $state(0);
	let buttonDisabled = $state(false);

	let confettiBtnRef: HTMLDivElement | undefined = $state(undefined);
	let wildIntervals: NodeJS.Timeout[] = [];

	// Permanent disco background interval
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

	function resetAll() {
		confettiClickCount = 0;
		buttonScale = 1;
		permanentDisco = false;
		totalChaos = false;
		gravityOut = false;
		confetti = false;

		wildIntervals.forEach(clearInterval);
		wildIntervals = [];

		document.querySelectorAll<HTMLElement>(".physics-item").forEach((el) => {
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

		switch (confettiClickCount) {
			case 5:
				permanentDisco = true;
				confetti = true;
				if (confettiBtnRef) goWild(confettiBtnRef);
				break;
			case 6:
				totalChaos = true;
				document.querySelectorAll<HTMLElement>(".physics-item").forEach(goWild);
				break;
			case 7:
				gravityOut = true;
				wildIntervals.forEach(clearInterval);
				wildIntervals = [];

				document.querySelectorAll<HTMLElement>(".physics-item").forEach((el) => {
					el.dataset.wild = "false";
					el.style.transition = "transform 2s cubic-bezier(0.55, 0.085, 0.68, 0.53)";
					el.style.transform = `translateY(${window.innerHeight + 400}px) rotate(${(Math.random() - 0.5) * 180}deg)`;
				});

				rebuilding = true;
				await sleep(5000);
				rebuilding = false;
				resetAll();
				break;
			default:
				if (confettiClickCount < 5) {
					confetti = true;
					await sleep(4000);
					if (!permanentDisco) confetti = false;
				}
				break;
		}

		buttonDisabled = false;
	}

	const games = [
		{ title: "Roll 'N Dodge", icon: "sports_martial_arts", href: "/games/roll_dodge/" },
		{ title: "Tower grappler", icon: "phishing", href: "/games/tower_grappler/" },
		{ title: "Tower stacker", icon: "stacks", href: "/games/tower_stacker/" },
		{ title: "Portal runner", icon: "sprint", href: "/games/portal_runner/" },
		{ title: "Mini golf", icon: "golf_course", href: "/games/golf/" },
		{ title: "Beam bender", icon: "stylus_laser_pointer", href: "/games/beam_bender/" },
		{ title: "Falling blocks", icon: "keyboard_double_arrow_down", href: "/games/falling_blocks/" },
		{ title: "Lava dodger", icon: "volcano", href: "/games/lava_dodger/" },
		{ title: "Tic Tac Toe", icon: "joystick", href: "/games/tic_tac_toe/" },
		{ title: "Police chase drifter", icon: "car_crash", href: "/games/police_chase_drifter/" },
		{ title: "Snake", icon: "earbuds", href: "/games/snake/" },
		{ title: "Breakout", icon: "view_compact", href: "/games/breakout/" }
	];

	const communityGames = [
		{
			title: "Tower defense",
			icon: "joystick",
			href: "/games/community/tower_defense"
		},
		{
			title: "Cola fabriek",
			icon: "joystick",
			href: "/games/community/cola_fabriek"
		},
		{
			title: "Rocket",
			icon: "rocket",
			href: "/games/community/rocket"
		}
	];

	let temp1 = $state(false);
	let temp2 = $state(false);
</script>

{#if confetti || permanentDisco}
	<div class="confetti-container">
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
		<div use:goWild class="physics-item chaos-title-wrapper">
			<h2 class="temp-disco chaos-heading">Davidnet speel eiland!</h2>
		</div>
	{/each}
{/if}

{#if rebuilding}
	<Flex
		justifyContent="center"
		alignItems="center"
		gap="large"
		direction="column"
		class="rebuilding-container">
		<h2 class="global-disco chaos-heading">Davidnet speel eiland!</h2>
		<Spinner size="huge" />
	</Flex>
{/if}

<div class:global-disco={permanentDisco} class:shake-screen={totalChaos && !gravityOut}>
	<Flex alignItems="center" marginTop="giant" direction="column">
		<Flex width="90%" marginTop="giant" direction="column" gap="small">
			<Flex justifyContent="spaceBetween" height="fit-content">
				<div class="physics-item">
					{#if confetti || permanentDisco}
						<h2 class="temp-disco dynamic-heading" class:disco-active={permanentDisco}>
							Davidnet speel eiland!
						</h2>
					{:else}
						<h2 class="default-heading">Games:</h2>
					{/if}
				</div>

				<Flex width="fit-content" height="fit-content" gap="medium">
					<div class="physics-item" bind:this={confettiBtnRef}>
						<div class="scale-wrapper" style="transform: scale({buttonScale});">
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

			<Flex gap="medium" height="fit-content" marginBottom="medium" flexWrap="wrap">
				{#each games as game}
					<div class="physics-item">
						<HorizontalCard title={game.title} icon={game.icon as iconType} href={game.href} />
					</div>
				{/each}
			</Flex>

			<div class="physics-item">
				<h2 class="default-heading" style="margin-top: 1rem;">Community Games:</h2>
			</div>

			<Flex gap="medium" height="fit-content" marginBottom="giant" flexWrap="wrap">
				{#each communityGames as game}
					<div class="physics-item">
						<HorizontalCard title={game.title} icon={game.icon as iconType} href={game.href} />
					</div>
				{/each}
				<div class="physics-item">
					{#if temp1 && !temp2}
						<img src="/operation-teapot-nuke.gif" alt="" height="85px" width="300px" />
					{:else if !temp1 && !temp2}
						<HorizontalCard
							title="Add community game"
							icon="add"
							onclick={async () => {
								toast("3 maanden :D", undefined, "flag", 2000, "danger");
								temp1 = true;
								await sleep(3000);
								temp2 = true;
							}} />
						<!--Gebruik sandboxing flags in iframe-->
					{/if}
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

	.confetti-container {
		position: fixed;
		top: -50px;
		left: 0;
		height: 100vh;
		width: 100vw;
		display: flex;
		justify-content: center;
		overflow: hidden;
		pointer-events: none;
		z-index: 9999;
	}

	.chaos-title-wrapper {
		position: fixed;
		top: 40%;
		left: 40%;
		z-index: 10000;
		pointer-events: none;
	}

	.chaos-heading {
		font-size: 3.5rem;
		text-align: center;
	}

	.temp-disco {
		animation: ultraDisco 1.5s infinite linear !important;
	}

	:global(.global-disco *) {
		animation: ultraDisco 1.5s infinite linear !important;
		border-color: currentColor !important;
	}

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

	.dynamic-heading {
		transition: font-size 0.5s ease;
	}

	.disco-active {
		font-size: 3.5rem;
		transition: font-size 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.default-heading {
		transition: font-size 0.5s ease;
	}

	.scale-wrapper {
		transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
		transform-origin: center;
	}
</style>
