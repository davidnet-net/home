<script lang="ts">
	import {
		authState,
		Flex,
		whenAuthReady,
		LinkButton,
		Button,
		Icon
	} from "@davidnet-net/svelte-ui";

	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { PUBLIC_ACCOUNT_FRONTEND_URL } from "$env/static/public";
	import { token } from "@davidnet-net/svelte-ui/tokens";
	import { onMount, onDestroy } from "svelte";

	// Auth check
	$effect(() => {
		(async () => {
			await whenAuthReady();
			if (!authState.isLoggedIn && !authState.loading) {
				window.location.href = `${PUBLIC_ACCOUNT_FRONTEND_URL}/login?continue=${encodeURIComponent(page.url.href)}`;
			}
		})();
	});

	// Game state (Volcano Dodger: Dodge falling boulders and rising magma!)
	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null;
	let score = $state(0);
	let gameRunning = $state(false);
	let gameOver = $state(false);
	let animationFrameId: number;

	// Player position (a tiny explorer escaping the volcano)
	let player = {
		x: 160,
		y: 380,
		width: 16,
		height: 16,
		speed: 4,
		dx: 0
	};

	// Obstacles: Falling lava bombs
	type Rock = { x: number; y: number; radius: number; speed: number };
	let rocks: Rock[] = [];
	let frameCount = 0;

	// Controls tracking
	let keys: { [key: string]: boolean } = {};

	onMount(() => {
		ctx = canvas.getContext("2d");
		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("keyup", handleKeyUp);
		draw();
	});

	onDestroy(() => {
		if (animationFrameId) cancelAnimationFrame(animationFrameId);
		window.removeEventListener("keydown", handleKeyDown);
		window.removeEventListener("keyup", handleKeyUp);
	});

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === "ArrowLeft" || e.key === "a") keys["left"] = true;
		if (e.key === "ArrowRight" || e.key === "d") keys["right"] = true;
	}

	function handleKeyUp(e: KeyboardEvent) {
		if (e.key === "ArrowLeft" || e.key === "a") keys["left"] = false;
		if (e.key === "ArrowRight" || e.key === "d") keys["right"] = false;
	}

	// Mouse / Touch controls for mobile or click preference
	function handleCanvasPointer(e: MouseEvent) {
		if (!gameRunning) {
			startGame();
			return;
		}
		const rect = canvas.getBoundingClientRect();
		const clickX = e.clientX - rect.left;
		// Move player towards click position smoothly
		if (clickX < player.x) {
			player.x -= 20;
		} else {
			player.x += 20;
		}
	}

	function startGame() {
		score = 0;
		rocks = [];
		player.x = 160;
		gameRunning = true;
		gameOver = false;
		frameCount = 0;
		loop();
	}

	function loop() {
		if (!gameRunning) return;
		frameCount++;
		score = Math.floor(frameCount / 10);

		// Update player position based on keyboard input
		if (keys["left"]) player.x -= player.speed;
		if (keys["right"]) player.x += player.speed;

		// Keep player inside canvas bounds
		if (player.x < 10) player.x = 10;
		if (player.x > canvas.width - 20) player.x = canvas.width - 20;

		// Spawn volcanic rocks periodically
		if (frameCount % 30 === 0) {
			rocks.push({
				x: Math.random() * (canvas.width - 30) + 15,
				y: -10,
				radius: Math.random() * 8 + 6,
				speed: Math.random() * 2 + 2.5 + score * 0.02
			});
		}

		// Update rocks
		for (let i = rocks.length - 1; i >= 0; i--) {
			rocks[i].y += rocks[i].speed;

			// Collision check with player (Circle vs Box approximation)
			let distX = Math.abs(rocks[i].x - (player.x + player.width / 2));
			let distY = Math.abs(rocks[i].y - (player.y + player.height / 2));

			if (
				distX < player.width / 2 + rocks[i].radius &&
				distY < player.height / 2 + rocks[i].radius
			) {
				gameRunning = false;
				gameOver = true;
				return;
			}

			// Remove rocks off screen
			if (rocks[i].y > canvas.height + 20) {
				rocks.splice(i, 1);
			}
		}

		draw();
		animationFrameId = requestAnimationFrame(loop);
	}

	function draw() {
		if (!ctx || !canvas) return;

		// Volcanic ash background
		ctx.fillStyle = "#1a0f0a";
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		// Draw boiling magma pool at the bottom
		let gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - 40);
		gradient.addColorStop(0, "#ff2200");
		gradient.addColorStop(1, "#ff8800");
		ctx.fillStyle = gradient;
		ctx.fillRect(0, canvas.height - 30, canvas.width, 30);

		// Draw falling magma rocks
		ctx.fillStyle = "#ffaa00";
		for (let rock of rocks) {
			ctx.beginPath();
			ctx.arc(rock.x, rock.y, rock.radius, 0, Math.PI * 2);
			ctx.fillStyle = "#ff4400";
			ctx.fill();
			ctx.strokeStyle = "#ffcc00";
			ctx.lineWidth = 2;
			ctx.stroke();
			ctx.closePath();
		}

		// Draw player explorer
		ctx.fillStyle = "#00ffff";
		ctx.fillRect(player.x, player.y, player.width, player.height);
		// Little detail for the explorer
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(player.x + 4, player.y - 4, 8, 4);
	}

	function resetGame() {
		gameRunning = false;
		gameOver = false;
		score = 0;
		rocks = [];
		player.x = 160;
		draw();
	}

	function toggleFullscreen() {
		if (!canvas) return;
		if (!document.fullscreenElement) {
			canvas.requestFullscreen().catch((err) => {
				console.error("Error attempting to enable fullscreen:", err);
			});
		} else {
			document.exitFullscreen();
		}
	}
</script>

<Flex alignItems="center" marginTop="medium" direction="column" gap="medium">
	<!-- Game Container Wrapper matching your Design Tokens -->
	<div
		style="position: relative; width: 320px; height: 480px; border-radius: {token.global.radius
			.huge}; overflow: hidden; border: 2px solid {token.theme.color.border?.primary ||
			'#333'}; background: {token.theme.color.surface?.primary ||
			'#111'}; display: flex; justify-content: center; align-items: center;">
		<!-- Score UI inside the game screen -->
		<div
			style="position: absolute; top: 15px; width: 100%; text-align: center; font-weight: bold; font-size: 20px; z-index: 10; pointer-events: none; color: white;">
			Survival Time: {score}s
		</div>

		{#if !gameRunning && !gameOver}
			<div
				style="position: absolute; text-align: center; z-index: 10; pointer-events: none; color: #aaa; padding: 0 20px;">
				<strong style="color: #ff8800;">Volcano Dodger</strong>
				<br />
				Use
				<code style="background: #333; padding: 2px 6px; border-radius: 4px; color: #fff;">A</code>
				/
				<code style="background: #333; padding: 2px 6px; border-radius: 4px; color: #fff;">D</code>
				or Arrow Keys to dodge falling magma!
				<br />
				<br />
				<span style="font-size: 14px; color: #fff;">Click canvas to start</span>
			</div>
		{:else if gameOver}
			<div
				style="position: absolute; text-align: center; z-index: 10; pointer-events: none; color: #ff4444; font-weight: bold;">
				CRUSHED BY LAVA!
				<br />
				<span style="color: white; font-size: 16px;">Survived: {score} seconds</span>
				<br />
				<br />
				<span style="font-size: 12px; color: #aaa;">Click to play again</span>
			</div>
		{/if}

		<!-- Canvas Game Element -->
		<canvas
			bind:this={canvas}
			width="320"
			height="480"
			onmousedown={handleCanvasPointer}
			style="display: block; width: 100%; height: 100%; cursor: pointer;">
		</canvas>
	</div>

	<!-- Action Buttons -->
	<Flex height="fit-content" width="fit-content" gap="small">
		<LinkButton href="/games" iconbefore="arrow_back">Back</LinkButton>
		<Button onclick={resetGame} iconbefore="refresh">Reset</Button>
		<Button onclick={toggleFullscreen} iconbefore="fullscreen">Fullscreen</Button>
	</Flex>

	<!-- Footer AI Credit -->
	<Flex
		width="fit-content"
		height="fit-content"
		alignItems="center"
		style="color: {token.theme.color.text.tertiary}"
		gap="xsmall"
		verticalAlign="middle">
		<Icon icon="star_shine" />Game is generated with AI!
	</Flex>
</Flex>
