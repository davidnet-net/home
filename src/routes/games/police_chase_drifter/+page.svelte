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
	import { onMount } from "svelte";

	$effect(() => {
		(async () => {
			await whenAuthReady();
			if (!authState.isLoggedIn && !authState.loading) {
				window.location.href = `${PUBLIC_ACCOUNT_FRONTEND_URL}/login?continue=${encodeURIComponent(page.url.href)}`;
			}
		})();
	});

	let canvasRef = $state<HTMLCanvasElement | undefined>();
	let gameContainerRef = $state<HTMLDivElement | undefined>();
	let level = $state(1);
	let cashCollected = $state(0);
	let totalCash = $state(3);
	let gameOver = $state(false);
	let gameWon = $state(false);
	let nearestBagAngle = $state(0);

	// Canvas & Viewport Constants
	const VIEW_WIDTH = 800;
	const VIEW_HEIGHT = 500;
	const WORLD_WIDTH = 4000;
	const WORLD_HEIGHT = 4000;

	// Player properties
	let player = {
		x: 250,
		y: 250,
		width: 44,
		height: 22,
		radius: 18,
		angle: 0,
		speed: 0,
		vx: 0,
		vy: 0,
		maxSpeed: 5.5,
		acceleration: 0.15,
		friction: 0.94,
		turnSpeed: 0.045
	};

	// Randomized Procedural City Grid Buildings (varying sizes & staggered layout)
	const buildings: { x: number; y: number; w: number; h: number }[] = [];
	for (let gx = 400; gx < WORLD_WIDTH - 400; gx += 550) {
		for (let gy = 400; gy < WORLD_HEIGHT - 400; gy += 550) {
			// Add jitter/randomness to positions and sizes for organic layout
			const jitterX = (Math.random() - 0.5) * 80;
			const jitterY = (Math.random() - 0.5) * 80;
			const w = 260 + Math.random() * 120;
			const h = 260 + Math.random() * 120;
			buildings.push({ x: gx + jitterX, y: gy + jitterY, w, h });
		}
	}

	let cashBags = $state<{ x: number; y: number; collected: boolean }[]>([]);
	let cops = $state<
		{
			x: number;
			y: number;
			radius: number;
			speed: number;
			vx: number;
			vy: number;
			width: number;
			height: number;
			pathTimer: number;
			flankAngle: number;
		}[]
	>([]);

	let keys: Record<string, boolean> = {};

	function handleKeyDown(e: KeyboardEvent) {
		if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Shift"].includes(e.key)) {
			e.preventDefault();
		}
		keys[e.key] = true;
	}

	function handleKeyUp(e: KeyboardEvent) {
		keys[e.key] = false;
		if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
			keys["ArrowLeft"] = false;
			keys["a"] = false;
			keys["A"] = false;
		}
		if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
			keys["ArrowRight"] = false;
			keys["d"] = false;
			keys["D"] = false;
		}
	}

	function initLevel() {
		gameOver = false;
		gameWon = false;
		cashCollected = 0;
		totalCash = 3 + level * 2;

		player.x = 250;
		player.y = 250;
		player.angle = 0;
		player.speed = 0;
		player.vx = 0;
		player.vy = 0;

		cashBags = [];
		for (let i = 0; i < totalCash; i++) {
			let valid = false;
			let bx = 0,
				by = 0;
			while (!valid) {
				bx = Math.random() * (WORLD_WIDTH - 500) + 250;
				by = Math.random() * (WORLD_HEIGHT - 500) + 250;
				valid = !buildings.some(
					(b) => bx > b.x - 40 && bx < b.x + b.w + 40 && by > b.y - 40 && by < b.y + b.h + 40
				);
			}
			cashBags.push({ x: bx, y: by, collected: false });
		}

		cops = [];
		const copCount = Math.min(2 + level, 9);
		// Cops are now nearly as fast as the player's max speed (5.5)
		const copSpeed = 4.2 + level * 0.18;

		for (let i = 0; i < copCount; i++) {
			let cx = Math.random() * (WORLD_WIDTH - 600) + 300;
			let cy = Math.random() * (WORLD_HEIGHT - 600) + 300;
			while (Math.hypot(cx - player.x, cy - player.y) < 900) {
				cx = Math.random() * (WORLD_WIDTH - 600) + 300;
				cy = Math.random() * (WORLD_HEIGHT - 600) + 300;
			}
			cops.push({
				x: cx,
				y: cy,
				radius: 18,
				speed: copSpeed,
				vx: 0,
				vy: 0,
				width: 44,
				height: 22,
				pathTimer: Math.random() * 100,
				flankAngle: (i % 2 === 0 ? 1 : -1) * (0.6 + Math.random() * 0.5)
			});
		}
	}

	function resetGame() {
		if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
		keys = {};
		level = 1;
		initLevel();
	}

	function nextLevel() {
		if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
		keys = {};
		level++;
		initLevel();
	}

	// Robust Circle-vs-Rectangle collision resolution function
	function resolveCircleRectCollisions(entity: {
		x: number;
		y: number;
		radius: number;
		vx: number;
		vy: number;
	}) {
		for (const b of buildings) {
			const closestX = Math.max(b.x, Math.min(entity.x, b.x + b.w));
			const closestY = Math.max(b.y, Math.min(entity.y, b.y + b.h));

			const distX = entity.x - closestX;
			const distY = entity.y - closestY;
			const distance = Math.hypot(distX, distY);

			if (distance < entity.radius) {
				if (distance > 0) {
					const overlap = entity.radius - distance;
					entity.x += (distX / distance) * overlap;
					entity.y += (distY / distance) * overlap;
				} else {
					entity.x -= entity.vx;
					entity.y -= entity.vy;
				}
				entity.vx *= -0.2;
				entity.vy *= -0.2;
			}
		}
	}

	onMount(() => {
		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("keyup", handleKeyUp);

		const handleBlur = () => {
			keys = {};
		};
		window.addEventListener("blur", handleBlur);

		initLevel();

		const canvas = canvasRef;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		let animationFrameId: number;
		let lastTime = performance.now();

		function update(dt: number) {
			if (gameOver || gameWon) return;

			const timeScale = Math.min(dt / (1000 / 60), 2.0);
			const isDrifting = keys["Shift"] || keys["ShiftLeft"] || keys["ShiftRight"];

			// 1. Throttle & Speed Control with Delta Timing
			if (keys["ArrowUp"] || keys["w"] || keys["W"]) {
				player.speed += player.acceleration * timeScale;
			} else if (keys["ArrowDown"] || keys["s"] || keys["S"]) {
				player.speed -= player.acceleration * 0.7 * timeScale;
			} else {
				player.speed *= Math.pow(player.friction, timeScale);
			}

			if (player.speed > player.maxSpeed) player.speed = player.maxSpeed;
			if (player.speed < -player.maxSpeed / 2) player.speed = -player.maxSpeed / 2;

			// 2. Steering
			if (Math.abs(player.speed) > 0.1) {
				const turnMultiplier = isDrifting ? 1.4 : 1.0;
				const dirSign = player.speed >= 0 ? 1 : -1;

				const turningLeft = keys["ArrowLeft"] || keys["a"] || keys["A"];
				const turningRight = keys["ArrowRight"] || keys["d"] || keys["D"];

				if (turningLeft && !turningRight) {
					player.angle -= player.turnSpeed * turnMultiplier * dirSign * timeScale;
				} else if (turningRight && !turningLeft) {
					player.angle += player.turnSpeed * turnMultiplier * dirSign * timeScale;
				}
			}

			// 3. Arcade Drift Velocity Blending Model
			const targetVx = Math.cos(player.angle) * player.speed;
			const targetVy = Math.sin(player.angle) * player.speed;

			const driftInertia = isDrifting ? 0.08 : 0.3;
			const lerpFactor = 1 - Math.pow(1 - driftInertia, timeScale);
			player.vx += (targetVx - player.vx) * lerpFactor;
			player.vy += (targetVy - player.vy) * lerpFactor;

			// 4. Smooth Collision Resolution
			player.x += player.vx * timeScale;
			resolveCircleRectCollisions(player);

			player.y += player.vy * timeScale;
			resolveCircleRectCollisions(player);

			// World bounds clamp
			if (player.x < 50) {
				player.x = 50;
				player.vx *= -0.3;
			}
			if (player.x > WORLD_WIDTH - 50) {
				player.x = WORLD_WIDTH - 50;
				player.vx *= -0.3;
			}
			if (player.y < 50) {
				player.y = 50;
				player.vy *= -0.3;
			}
			if (player.y > WORLD_HEIGHT - 50) {
				player.y = WORLD_HEIGHT - 50;
				player.vy *= -0.3;
			}

			// Cash collection check
			cashBags.forEach((bag) => {
				if (!bag.collected) {
					const dist = Math.hypot(player.x - bag.x, player.y - bag.y);
					if (dist < 34) {
						bag.collected = true;
						cashCollected++;
						if (cashCollected >= totalCash) {
							gameWon = true;
						}
					}
				}
			});

			// Nearest cash arrow calculation
			const activeBags = cashBags.filter((b) => !b.collected);
			if (activeBags.length > 0) {
				let nearest = activeBags[0];
				let minDist = Math.hypot(player.x - nearest.x, player.y - nearest.y);
				for (const bag of activeBags) {
					const d = Math.hypot(player.x - bag.x, player.y - bag.y);
					if (d < minDist) {
						minDist = d;
						nearest = bag;
					}
				}
				nearestBagAngle = Math.atan2(nearest.y - player.y, nearest.x - player.x) - player.angle;
			}

			// Smarter Cop AI pursuit with predictive flanking & obstacle avoidance
			cops.forEach((cop) => {
				cop.pathTimer += timeScale;

				// Predict player position slightly ahead based on player velocity (smart intercept)
				const predictionFactor = 15;
				const predictedX = player.x + player.vx * predictionFactor;
				const predictedY = player.y + player.vy * predictionFactor;

				// Apply dynamic flanking angle so cops don't all cluster in a single straight line
				const baseAngle = Math.atan2(predictedY - cop.y, predictedX - cop.x);
				const smartAngle = baseAngle + (cop.pathTimer % 120 < 60 ? cop.flankAngle : 0);

				const targetVx = Math.cos(smartAngle) * cop.speed;
				const targetVy = Math.sin(smartAngle) * cop.speed;

				const copLerp = 1 - Math.pow(1 - 0.15, timeScale);
				cop.vx += (targetVx - cop.vx) * copLerp;
				cop.vy += (targetVy - cop.vy) * copLerp;

				cop.x += cop.vx * timeScale;
				resolveCircleRectCollisions(cop);

				cop.y += cop.vy * timeScale;
				resolveCircleRectCollisions(cop);

				const distToPlayer = Math.hypot(player.x - cop.x, player.y - cop.y);
				if (distToPlayer < 30) {
					gameOver = true;
				}
			});
		}

		function draw() {
			ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

			ctx.save();
			const cameraX = VIEW_WIDTH / 2 - player.x;
			const cameraY = VIEW_HEIGHT / 2 - player.y;
			ctx.translate(cameraX, cameraY);

			// Asphalt background
			ctx.fillStyle = "#0f172a";
			ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

			// Road grid lines
			ctx.strokeStyle = "#1e293b";
			ctx.lineWidth = 5;
			for (let gx = 400; gx < WORLD_WIDTH; gx += 550) {
				ctx.beginPath();
				ctx.moveTo(gx, 0);
				ctx.lineTo(gx, WORLD_HEIGHT);
				ctx.stroke();
			}
			for (let gy = 400; gy < WORLD_HEIGHT; gy += 550) {
				ctx.beginPath();
				ctx.moveTo(0, gy);
				ctx.lineTo(WORLD_WIDTH, gy);
				ctx.stroke();
			}

			// Buildings with varied randomized accent outlines
			buildings.forEach((b, index) => {
				ctx.fillStyle = index % 2 === 0 ? "#1e293b" : "#111827";
				ctx.fillRect(b.x, b.y, b.w, b.h);
				ctx.strokeStyle = index % 3 === 0 ? "#38bdf8" : "#6366f1";
				ctx.lineWidth = 3;
				ctx.strokeRect(b.x, b.y, b.w, b.h);
			});

			// Cash Bags
			cashBags.forEach((bag) => {
				if (!bag.collected) {
					ctx.fillStyle = "#facc15";
					ctx.beginPath();
					ctx.arc(bag.x, bag.y, 16, 0, Math.PI * 2);
					ctx.fill();
					ctx.strokeStyle = "#ffffff";
					ctx.lineWidth = 3;
					ctx.stroke();

					ctx.fillStyle = "#0f172a";
					ctx.font = "bold 18px sans-serif";
					ctx.textAlign = "center";
					ctx.textBaseline = "middle";
					ctx.fillText("$", bag.x, bag.y);
				}
			});

			// Cops
			cops.forEach((cop) => {
				ctx.save();
				ctx.translate(cop.x, cop.y);
				ctx.rotate(Math.atan2(player.y - cop.y, player.x - cop.x));
				ctx.fillStyle = "#3b82f6";
				ctx.fillRect(-cop.width / 2, -cop.height / 2, cop.width, cop.height);
				ctx.fillStyle = Math.floor(Date.now() / 140) % 2 === 0 ? "#ef4444" : "#ffffff";
				ctx.fillRect(-5, -5, 10, 10);
				ctx.restore();
			});

			// Player Car & Drift Smoke
			ctx.save();
			ctx.translate(player.x, player.y);
			ctx.rotate(player.angle);

			const isDrifting = keys["Shift"] || keys["ShiftLeft"] || keys["ShiftRight"];
			if (isDrifting && Math.hypot(player.vx, player.vy) > 1.5) {
				ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
				ctx.fillRect(-24, -16, 12, 6);
				ctx.fillRect(-24, 10, 12, 6);
			}

			ctx.fillStyle = "#e11d48";
			ctx.fillRect(-player.width / 2, -player.height / 2, player.width, player.height);
			ctx.fillStyle = "#0f172a";
			ctx.fillRect(4, -player.height / 2 + 3, 9, player.height - 6);
			ctx.restore();

			ctx.restore(); // Restore camera translation

			// --- ON-SCREEN CANVAS HUD (Nearest Cash Arrow Overlay) ---
			ctx.save();
			const hudX = VIEW_WIDTH - 130;
			const hudY = 35;

			ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
			ctx.strokeStyle = "#38bdf8";
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.roundRect(hudX - 10, hudY - 15, 120, 40, 6);
			ctx.fill();
			ctx.stroke();

			ctx.fillStyle = "#94a3b8";
			ctx.font = "11px sans-serif";
			ctx.textAlign = "left";
			ctx.textBaseline = "middle";
			ctx.fillText("Nearest Cash", hudX, hudY - 3);

			ctx.save();
			ctx.translate(hudX + 90, hudY + 4);
			ctx.rotate(nearestBagAngle);
			ctx.fillStyle = "#22c55e";
			ctx.beginPath();
			ctx.moveTo(9, 0);
			ctx.lineTo(-4, -4);
			ctx.lineTo(-1, 0);
			ctx.lineTo(-4, 4);
			ctx.closePath();
			ctx.fill();
			ctx.restore();

			ctx.restore();
		}

		function loop(timestamp: number) {
			const dt = timestamp - lastTime;
			lastTime = timestamp;

			update(dt);
			draw();
			animationFrameId = requestAnimationFrame(loop);
		}

		animationFrameId = requestAnimationFrame(loop);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("keyup", handleKeyUp);
			window.removeEventListener("blur", handleBlur);
			cancelAnimationFrame(animationFrameId);
		};
	});

	function toggleFullscreen() {
		if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
		if (!gameContainerRef) return;
		if (!document.fullscreenElement) {
			gameContainerRef.requestFullscreen().catch((err) => {
				console.error(`Error attempting to enable fullscreen: ${err.message}`);
			});
		} else {
			document.exitFullscreen();
		}
	}
</script>

<Flex alignItems="center" marginTop="medium" direction="column" gap="medium">
	<div
		bind:this={gameContainerRef}
		style="height: 75vh; width: 90vw; max-width: 1200px; border-radius: {token.global.radius
			.huge}; overflow: hidden; position: relative; background: #0f172a; display: flex; flex-direction: column; align-items: center; justify-content: center;">
		<div
			style="position: absolute; top: 16px; left: 20px; color: #ffffff; font-family: {token.global
				.font.family.sans}; font-weight: {token.global.font.weight.bold}; font-size: {token.global
				.font.size.medium}; display: flex; gap: {token.global.spacing
				.large}; pointer-events: none; z-index: 10; align-items: center;">
			<div>Level: {level}</div>
			<div>Cash: {cashCollected}/{totalCash}</div>
			<div style="font-size: 0.85rem; color: #94a3b8; font-weight: normal;">
				(Hold SHIFT to Drift)
			</div>
		</div>

		<canvas
			bind:this={canvasRef}
			width="800"
			height="500"
			style="max-width: 100%; max-height: 100%; object-fit: contain; cursor: crosshair;">
		</canvas>

		{#if gameOver || gameWon}
			<div
				style="position: absolute; inset: 0; background: rgba(15, 23, 42, 0.92); display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; gap: 1.2rem; z-index: 20;">
				<h2 style="font-size: 2.8rem; color: {gameOver ? '#ef4444' : '#22c55e'}; margin: 0;">
					{gameOver ? "BUSTED! Cop Caught You" : "Level Cleared!"}
				</h2>
				<p style="color: #94a3b8; font-size: 1.1rem; margin: 0;">
					{gameOver
						? "The cops are fast and smart now! Use sharp drifts to shake them."
						: "Amazing driving! Get ready for a larger city & faster cops."}
				</p>
				<Button onclick={gameOver ? resetGame : nextLevel}>
					{gameOver ? "Try Again" : "Next Level"}
				</Button>
			</div>
		{/if}
	</div>

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
</Flex>
