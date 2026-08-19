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

	// Strict TypeScript Interfaces
	interface Block {
		x: number;
		y: number;
		width: number;
		height: number;
		color: string;
	}

	interface FallingPiece {
		x: number;
		y: number;
		width: number;
		height: number;
		color: string;
		vx: number;
		vy: number;
		rotation: number;
		vRot: number;
	}

	interface Particle {
		x: number;
		y: number;
		vx: number;
		vy: number;
		radius: number;
		color: string;
		alpha: number;
		life: number;
		maxLife: number;
	}

	let canvasRef = $state<HTMLCanvasElement | undefined>();
	let gameContainerRef = $state<HTMLDivElement | undefined>();
	let score = $state(0);
	let combo = $state(0);
	let bestScore = $state(0);
	let gameOver = $state(false);
	let resetSignal = $state(0);

	// Canvas & World Constants
	const VIEW_WIDTH = 800;
	const VIEW_HEIGHT = 500;
	const BLOCK_HEIGHT = 28;

	$effect(() => {
		(async () => {
			await whenAuthReady();
			if (!authState.isLoggedIn && !authState.loading) {
				window.location.href = `${PUBLIC_ACCOUNT_FRONTEND_URL}/login?continue=${encodeURIComponent(page.url.href)}`;
			}
		})();
	});

	// Main Game Loop Effect
	$effect(() => {
		if (!canvasRef) return;
		const ctx = canvasRef.getContext("2d");
		if (!ctx) return;

		const _trigger = resetSignal;

		if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}

		let animationFrameId: number;

		// Color Generation State
		let hueCounter = 200; // Starts at blue/cyan

		function getNextColor() {
			hueCounter = (hueCounter + 12) % 360;
			return `hsl(${hueCounter}, 85%, 60%)`;
		}

		// Game State Variables
		let stack: Block[] = [];
		let fallingPieces: FallingPiece[] = [];
		let particles: Particle[] = [];
		let screenShake = 0;

		let activeBlock = {
			x: 0,
			y: 0,
			width: 240,
			height: BLOCK_HEIGHT,
			vx: 3.5,
			color: getNextColor()
		};

		let cameraY = 0;
		let targetCameraY = 0;

		function triggerShake(intensity = 4) {
			screenShake = Math.max(screenShake, intensity);
		}

		function spawnParticles(x: number, y: number, color: string, count = 12) {
			for (let i = 0; i < count; i++) {
				const angle = Math.random() * Math.PI * 2;
				const speed = 1 + Math.random() * 5;
				particles.push({
					x,
					y,
					vx: Math.cos(angle) * speed,
					vy: Math.sin(angle) * speed,
					radius: 2 + Math.random() * 3,
					color,
					alpha: 1,
					life: 0,
					maxLife: 15 + Math.random() * 20
				});
			}
		}

		function initGame() {
			hueCounter = 200;
			score = 0;
			combo = 0;
			gameOver = false;
			stack = [];
			fallingPieces = [];
			particles = [];

			// Base Foundation Block
			const baseBlock: Block = {
				x: VIEW_WIDTH / 2 - 120,
				y: VIEW_HEIGHT - 80,
				width: 240,
				height: BLOCK_HEIGHT,
				color: getNextColor()
			};
			stack.push(baseBlock);

			// First Active Block
			activeBlock = {
				x: 0,
				y: baseBlock.y - BLOCK_HEIGHT,
				width: baseBlock.width,
				height: BLOCK_HEIGHT,
				vx: 3.8,
				color: getNextColor()
			};

			cameraY = 0;
			targetCameraY = 0;
		}

		initGame();

		// Handle Block Drop Interaction
		function dropBlock() {
			if (gameOver) return;

			const topBlock = stack[stack.length - 1];
			const diff = activeBlock.x - topBlock.x;
			const absoluteDiff = Math.abs(diff);

			// Perfect Alignment Window (< 4px)
			if (absoluteDiff < 4) {
				activeBlock.x = topBlock.x; // Snap precisely
				combo += 1;
				score += 1 + combo;

				spawnParticles(
					activeBlock.x + activeBlock.width / 2,
					activeBlock.y + BLOCK_HEIGHT / 2,
					"#ffffff",
					20
				);
				triggerShake(3);

				// Place Perfect Block
				stack.push({
					x: activeBlock.x,
					y: activeBlock.y,
					width: activeBlock.width,
					height: BLOCK_HEIGHT,
					color: activeBlock.color
				});
			} else if (absoluteDiff >= activeBlock.width) {
				// Complete Miss -> Game Over
				gameOver = true;
				if (score > bestScore) bestScore = score;

				fallingPieces.push({
					x: activeBlock.x,
					y: activeBlock.y,
					width: activeBlock.width,
					height: BLOCK_HEIGHT,
					color: activeBlock.color,
					vx: activeBlock.vx * 0.5,
					vy: 1,
					rotation: 0,
					vRot: (Math.random() - 0.5) * 0.1
				});

				triggerShake(6);
				return;
			} else {
				// Chop / Slice Block
				combo = 0;
				score += 1;

				let newWidth = activeBlock.width - absoluteDiff;
				let newX = activeBlock.x;
				let slicedX = 0;
				let slicedWidth = absoluteDiff;

				if (diff > 0) {
					// Overhang on Right
					newX = activeBlock.x;
					slicedX = topBlock.x + topBlock.width;
				} else {
					// Overhang on Left
					newX = topBlock.x;
					slicedX = activeBlock.x;
				}

				// Add Stacked Piece
				stack.push({
					x: newX,
					y: activeBlock.y,
					width: newWidth,
					height: BLOCK_HEIGHT,
					color: activeBlock.color
				});

				// Add Chopped Off Piece with Falling Physics
				fallingPieces.push({
					x: slicedX,
					y: activeBlock.y,
					width: slicedWidth,
					height: BLOCK_HEIGHT,
					color: activeBlock.color,
					vx: diff > 0 ? 2 : -2,
					vy: 0.5,
					rotation: 0,
					vRot: (Math.random() - 0.5) * 0.12
				});

				spawnParticles(
					diff > 0 ? slicedX : slicedX + slicedWidth,
					activeBlock.y + BLOCK_HEIGHT / 2,
					activeBlock.color,
					8
				);

				activeBlock.width = newWidth;
			}

			if (score > bestScore) bestScore = score;

			// Spawn Next Active Block
			const nextY = activeBlock.y - BLOCK_HEIGHT;
			const speedMultiplier = 1 + Math.min(score * 0.03, 1.8);
			const direction = Math.random() > 0.5 ? 1 : -1;

			activeBlock = {
				x: direction === 1 ? -activeBlock.width : VIEW_WIDTH,
				y: nextY,
				width: activeBlock.width,
				height: BLOCK_HEIGHT,
				vx: (3.5 + Math.random() * 0.8) * speedMultiplier * direction,
				color: getNextColor()
			};

			// Smooth Camera Rise
			if (stack.length > 5) {
				targetCameraY = (stack.length - 5) * BLOCK_HEIGHT;
			}
		}

		// Input Listeners
		const handleKeyDown = (e: KeyboardEvent) => {
			if ([" ", "ArrowDown", "Enter"].includes(e.key)) {
				e.preventDefault();
				dropBlock();
			}
		};

		const handleCanvasClick = (e: MouseEvent) => {
			e.preventDefault();
			dropBlock();
		};

		window.addEventListener("keydown", handleKeyDown);
		if (canvasRef) {
			canvasRef.addEventListener("mousedown", handleCanvasClick);
		}

		// Game Loop Update Function
		function update() {
			// Decay Screen Shake
			if (screenShake > 0) {
				screenShake -= 0.25;
				if (screenShake < 0) screenShake = 0;
			}

			// Camera Ease
			cameraY += (targetCameraY - cameraY) * 0.08;

			if (!gameOver) {
				// Move Active Block
				activeBlock.x += activeBlock.vx;

				if (activeBlock.x <= 0 && activeBlock.vx < 0) {
					activeBlock.vx *= -1;
				} else if (activeBlock.x + activeBlock.width >= VIEW_WIDTH && activeBlock.vx > 0) {
					activeBlock.vx *= -1;
				}
			}

			// Update Chopped Falling Pieces
			for (let i = fallingPieces.length - 1; i >= 0; i--) {
				const piece = fallingPieces[i];
				piece.x += piece.vx;
				piece.y += piece.vy;
				piece.vy += 0.38; // Gravity
				piece.rotation += piece.vRot;

				if (piece.y - cameraY > VIEW_HEIGHT + 200) {
					fallingPieces.splice(i, 1);
				}
			}

			// Update Particles
			for (let i = particles.length - 1; i >= 0; i--) {
				const p = particles[i];
				p.x += p.vx;
				p.y += p.vy;
				p.life++;
				p.alpha = 1 - p.life / p.maxLife;

				if (p.life >= p.maxLife) {
					particles.splice(i, 1);
				}
			}
		}

		// Canvas Render Function
		function draw() {
			if (!canvasRef) return;
			if (!ctx) return;

			ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

			// Background
			ctx.fillStyle = "#111827";
			ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

			ctx.save();

			// Screen Shake Offset
			let offsetX = 0;
			let offsetY = 0;
			if (screenShake > 0) {
				offsetX = (Math.random() - 0.5) * screenShake * 2;
				offsetY = (Math.random() - 0.5) * screenShake * 2;
			}

			ctx.translate(offsetX, cameraY + offsetY);

			// Draw Stacked Tower Blocks
			stack.forEach((block) => {
				ctx.fillStyle = block.color;
				ctx.fillRect(block.x, block.y, block.width, block.height);
				ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
				ctx.lineWidth = 1.5;
				ctx.strokeRect(block.x, block.y, block.width, block.height);
			});

			// Draw Active Moving Block
			if (!gameOver) {
				ctx.fillStyle = activeBlock.color;
				ctx.fillRect(activeBlock.x, activeBlock.y, activeBlock.width, activeBlock.height);
				ctx.strokeStyle = "#ffffff";
				ctx.lineWidth = 2;
				ctx.strokeRect(activeBlock.x, activeBlock.y, activeBlock.width, activeBlock.height);
			}

			// Draw Falling Chopped Pieces
			fallingPieces.forEach((piece) => {
				ctx.save();
				ctx.translate(piece.x + piece.width / 2, piece.y + piece.height / 2);
				ctx.rotate(piece.rotation);
				ctx.fillStyle = piece.color;
				ctx.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
				ctx.restore();
			});

			// Draw Particles
			particles.forEach((p) => {
				ctx.save();
				ctx.globalAlpha = p.alpha;
				ctx.fillStyle = p.color;
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
				ctx.fill();
				ctx.restore();
			});

			ctx.restore();

			// Draw Game Over Screen Overlay
			if (gameOver) {
				resetGame();
			}
		}

		let lastTime: number | null = null;
		let accumulator = 0;
		const STEP = 1000 / 60;

		function gameLoop(timestamp: number) {
			if (lastTime === null) {
				lastTime = timestamp;
			}
			let dt = timestamp - lastTime;
			if (dt < 0) dt = 0;
			if (dt > 100) dt = 100;
			lastTime = timestamp;
			accumulator += dt;

			while (accumulator >= STEP) {
				update();
				accumulator -= STEP;
			}
			draw();
			animationFrameId = requestAnimationFrame(gameLoop);
		}

		animationFrameId = requestAnimationFrame(gameLoop);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			if (canvasRef) {
				canvasRef.removeEventListener("mousedown", handleCanvasClick);
			}
			cancelAnimationFrame(animationFrameId);
		};
	});

	function resetGame() {
		if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
		resetSignal += 1;
	}

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
		style="height: 90%; width: 90%; border-radius: {token.global.radius
			.huge}; overflow: hidden; position: relative; background: #111827; display: flex; flex-direction: column; align-items: center; justify-content: center;">
		<div
			style="position: absolute; top: 16px; left: 20px; color: #ffffff; font-family: {token.global
				.font.family.sans}; font-weight: {token.global.font.weight.bold}; font-size: {token.global
				.font.size.medium}; display: flex; gap: {token.global.spacing
				.large}; pointer-events: none; z-index: 10;">
			<div>Tower: {score}</div>
			<div>Best: {bestScore}</div>
			{#if combo > 1}
				<div style="color: #f1c40f;">Combo x{combo}!</div>
			{/if}
		</div>

		<canvas
			bind:this={canvasRef}
			width="800"
			height="500"
			style="max-width: 100%; max-height: 100%; object-fit: contain; cursor: pointer;">
		</canvas>
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
