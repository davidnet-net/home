<script lang="ts">
	import {
		authState,
		Flex,
		whenAuthReady,
		LinkButton,
		Button,
		Icon,
		identityState
	} from "@davidnet-net/svelte-ui";
	import { page } from "$app/state";
	import { PUBLIC_ACCOUNT_FRONTEND_URL } from "$env/static/public";
	import { token } from "@davidnet-net/svelte-ui/tokens";

	type GameState = "menu" | "playing" | "paused" | "gameover";
	type GameMode = "classic" | "portal" | "obstacles";
	type Difficulty = "slow" | "normal" | "fast" | "insane";
	type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";

	interface Point {
		x: number;
		y: number;
	}

	interface Apple extends Point {
		type: "normal" | "golden";
		timer?: number;
	}

	interface Particle {
		x: number;
		y: number;
		vx: number;
		vy: number;
		color: string;
		alpha: number;
		life: number;
		maxLife: number;
		radius: number;
	}

	let canvasRef = $state<HTMLCanvasElement | undefined>();
	let gameContainerRef = $state<HTMLDivElement | undefined>();

	let gameState = $state<GameState>("menu");
	let score = $state(0);
	let highScore = $state(0);
	let applesEaten = $state(0);

	let selectedMode = $state<GameMode>("classic");
	let selectedDifficulty = $state<Difficulty>("normal");

	// Widescreen 16:9 Grid Layout for maximum horizontal space
	const VIEW_WIDTH = 960;
	const VIEW_HEIGHT = 540;
	const GRID_COLS = 32;
	const GRID_ROWS = 18;
	const CELL_SIZE = VIEW_WIDTH / GRID_COLS; // 30px per cell

	const COLORS = {
		bg1: "#1e2229",
		bg2: "#252932",
		snakeHead: "#4f46e5",
		snakeBody: "#6366f1",
		snakeBorder: "#312e81",
		apple: "#ef4444",
		goldenApple: "#f59e0b",
		obstacle: "#475569",
		obstacleBorder: "#334155",
		text: "#f8fafc"
	};

	$effect(() => {
		if (typeof window !== "undefined") {
			const saved = localStorage.getItem("arcade_snake_highscore");
			if (saved) highScore = parseInt(saved, 10);
		}
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
		if (!canvasRef) return;
		const ctx = canvasRef.getContext("2d");
		if (!ctx) return;

		let animationFrameId: number;

		// Avatar Image Loader for Snake Head
		let avatarImg: HTMLImageElement | null = null;
		let avatarLoaded = false;
		const avatarURL = identityState?.user?.avatarURL;
		if (avatarURL) {
			const img = new Image();
			img.crossOrigin = "anonymous";
			img.src = avatarURL;
			img.onload = () => {
				avatarImg = img;
				avatarLoaded = true;
			};
		}

		let snake: Point[] = [
			{ x: 16, y: 9 },
			{ x: 15, y: 9 },
			{ x: 14, y: 9 }
		];
		let prevSnake: Point[] = JSON.parse(JSON.stringify(snake));
		let direction: Direction = "RIGHT";
		let nextDirection: Direction = "RIGHT";
		let apple: Apple = { x: 8, y: 8, type: "normal" };
		let obstacles: Point[] = [];
		let particles: Particle[] = [];

		const speeds: Record<Difficulty, number> = {
			slow: 130,
			normal: 95,
			fast: 65,
			insane: 42
		};

		let tickInterval = speeds[selectedDifficulty];
		let lastTickTime = performance.now();
		let interpolationProgress = 0;

		function spawnApple() {
			let valid = false;
			let newX = 0;
			let newY = 0;

			while (!valid) {
				newX = Math.floor(Math.random() * GRID_COLS);
				newY = Math.floor(Math.random() * GRID_ROWS);

				const onSnake = snake.some((s) => s.x === newX && s.y === newY);
				const onObstacle = obstacles.some((o) => o.x === newX && o.y === newY);

				if (!onSnake && !onObstacle) {
					valid = true;
				}
			}

			const isGolden = Math.random() < 0.15 && selectedMode !== "classic";
			apple = {
				x: newX,
				y: newY,
				type: isGolden ? "golden" : "normal",
				timer: isGolden ? 75 : undefined
			};
		}

		function initObstacles() {
			obstacles = [];
			if (selectedMode === "obstacles") {
				const count = 14;
				for (let i = 0; i < count; i++) {
					let valid = false;
					let ox = 0;
					let oy = 0;
					while (!valid) {
						ox = Math.floor(Math.random() * GRID_COLS);
						oy = Math.floor(Math.random() * GRID_ROWS);
						const distToCenter = Math.hypot(ox - 16, oy - 9);
						if (distToCenter > 5 && !obstacles.some((o) => o.x === ox && o.y === oy)) {
							valid = true;
						}
					}
					obstacles.push({ x: ox, y: oy });
				}
			}
		}

		function triggerParticles(gridX: number, gridY: number, color: string, count = 12) {
			const px = gridX * CELL_SIZE + CELL_SIZE / 2;
			const py = gridY * CELL_SIZE + CELL_SIZE / 2;
			for (let i = 0; i < count; i++) {
				const angle = Math.random() * Math.PI * 2;
				const speed = 1 + Math.random() * 4;
				particles.push({
					x: px,
					y: py,
					vx: Math.cos(angle) * speed,
					vy: Math.sin(angle) * speed,
					color,
					alpha: 1,
					life: 0,
					maxLife: 25 + Math.random() * 15,
					radius: 2 + Math.random() * 3.5
				});
			}
		}

		function resetGame() {
			snake = [
				{ x: 16, y: 9 },
				{ x: 15, y: 9 },
				{ x: 14, y: 9 }
			];
			prevSnake = JSON.parse(JSON.stringify(snake)); // Sync prevSnake immediately on reset to avoid ghost trails
			direction = "RIGHT";
			nextDirection = "RIGHT";
			score = 0;
			applesEaten = 0;
			tickInterval = speeds[selectedDifficulty];
			initObstacles();
			spawnApple();
			particles = [];
			gameState = "playing";
			lastTickTime = performance.now();
		}

		(window as any).startArcadeSnake = resetGame;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (gameState === "menu" && (e.key === "Enter" || e.key === " ")) {
				resetGame();
				return;
			}

			if (e.key === "Escape" || e.key === "p" || e.key === "P") {
				if (gameState === "playing") gameState = "paused";
				else if (gameState === "paused") gameState = "playing";
				return;
			}

			if (gameState !== "playing") return;

			switch (e.key) {
				case "ArrowUp":
				case "w":
				case "W":
					if (direction !== "DOWN") nextDirection = "UP";
					break;
				case "ArrowDown":
				case "s":
				case "S":
					if (direction !== "UP") nextDirection = "DOWN";
					break;
				case "ArrowLeft":
				case "a":
				case "A":
					if (direction !== "RIGHT") nextDirection = "LEFT";
					break;
				case "ArrowRight":
				case "d":
				case "D":
					if (direction !== "LEFT") nextDirection = "RIGHT";
					break;
			}
		};

		window.addEventListener("keydown", handleKeyDown);

		function updateGame() {
			if (gameState !== "playing") return;

			prevSnake = JSON.parse(JSON.stringify(snake));
			direction = nextDirection;
			const head = { ...snake[0] };

			if (direction === "UP") head.y--;
			if (direction === "DOWN") head.y++;
			if (direction === "LEFT") head.x--;
			if (direction === "RIGHT") head.x++;

			if (selectedMode === "portal") {
				if (head.x < 0) head.x = GRID_COLS - 1;
				if (head.x >= GRID_COLS) head.x = 0;
				if (head.y < 0) head.y = GRID_ROWS - 1;
				if (head.y >= GRID_ROWS) head.y = 0;
			} else {
				if (head.x < 0 || head.x >= GRID_COLS || head.y < 0 || head.y >= GRID_ROWS) {
					triggerParticles(snake[0].x, snake[0].y, COLORS.apple, 22);
					gameState = "gameover";
					return;
				}
			}

			if (snake.some((s) => s.x === head.x && s.y === head.y)) {
				triggerParticles(head.x, head.y, COLORS.apple, 22);
				gameState = "gameover";
				return;
			}

			if (selectedMode === "obstacles" && obstacles.some((o) => o.x === head.x && o.y === head.y)) {
				triggerParticles(head.x, head.y, COLORS.obstacle, 22);
				gameState = "gameover";
				return;
			}

			snake.unshift(head);

			if (head.x === apple.x && head.y === apple.y) {
				const pointsGained = apple.type === "golden" ? 5 : 1;
				score +=
					pointsGained *
					(selectedDifficulty === "insane" ? 3 : selectedDifficulty === "fast" ? 2 : 1);
				applesEaten += 1;

				if (score > highScore) {
					highScore = score;
					localStorage.setItem("arcade_snake_highscore", highScore.toString());
				}

				triggerParticles(
					apple.x,
					apple.y,
					apple.type === "golden" ? COLORS.goldenApple : COLORS.apple,
					16
				);
				spawnApple();
			} else {
				snake.pop();
			}

			if (apple.type === "golden" && apple.timer !== undefined) {
				apple.timer--;
				if (apple.timer <= 0) {
					spawnApple();
				}
			}
		}

		function updateParticles() {
			for (let i = particles.length - 1; i >= 0; i--) {
				const p = particles[i];
				p.x += p.vx;
				p.y += p.vy;
				p.life++;
				p.alpha = 1 - p.life / p.maxLife;
				if (p.life >= p.maxLife) particles.splice(i, 1);
			}
		}

		function draw(progress: number) {
			ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

			ctx.fillStyle = COLORS.bg1;
			ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

			for (let r = 0; r < GRID_ROWS; r++) {
				for (let c = 0; c < GRID_COLS; c++) {
					if ((r + c) % 2 === 0) {
						ctx.fillStyle = COLORS.bg2;
						ctx.fillRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
					}
				}
			}

			if (selectedMode === "obstacles") {
				obstacles.forEach((o) => {
					ctx.fillStyle = COLORS.obstacle;
					ctx.strokeStyle = COLORS.obstacleBorder;
					ctx.lineWidth = 2;
					ctx.beginPath();
					ctx.roundRect(o.x * CELL_SIZE + 3, o.y * CELL_SIZE + 3, CELL_SIZE - 6, CELL_SIZE - 6, 6);
					ctx.fill();
					ctx.stroke();
				});
			}

			const ax = apple.x * CELL_SIZE + CELL_SIZE / 2;
			const ay = apple.y * CELL_SIZE + CELL_SIZE / 2;
			const pulse = apple.type === "golden" ? 1 + Math.sin(performance.now() * 0.01) * 0.1 : 1;

			ctx.beginPath();
			ctx.arc(ax, ay, CELL_SIZE * 0.4 * pulse, 0, Math.PI * 2);
			ctx.fillStyle = apple.type === "golden" ? COLORS.goldenApple : COLORS.apple;
			ctx.fill();
			ctx.lineWidth = 2;
			ctx.strokeStyle = apple.type === "golden" ? "#b45309" : "#991b1b";
			ctx.stroke();

			snake.forEach((segment, index) => {
				const prev = prevSnake[index] || segment;
				let interpX = prev.x + (segment.x - prev.x) * progress;
				let interpY = prev.y + (segment.y - prev.y) * progress;

				// Prevent portal edge wrapping from stretching/ghosting across the screen
				if (selectedMode === "portal") {
					if (
						Math.abs(segment.x - prev.x) > GRID_COLS / 2 ||
						Math.abs(segment.y - prev.y) > GRID_ROWS / 2
					) {
						interpX = segment.x;
						interpY = segment.y;
					}
				}

				const sx = interpX * CELL_SIZE;
				const sy = interpY * CELL_SIZE;

				const headX = sx + 2;
				const headY = sy + 2;
				const headSize = CELL_SIZE - 4;

				if (index === 0) {
					ctx.save();
					ctx.beginPath();
					ctx.roundRect(headX, headY, headSize, headSize, 8);
					ctx.closePath();
					ctx.clip();

					if (avatarImg && avatarLoaded) {
						ctx.drawImage(avatarImg, headX, headY, headSize, headSize);
					} else {
						ctx.fillStyle = COLORS.snakeHead;
						ctx.fill();
					}
					ctx.restore();

					ctx.strokeStyle = "#ffffff";
					ctx.lineWidth = 2;
					ctx.beginPath();
					ctx.roundRect(headX, headY, headSize, headSize, 8);
					ctx.stroke();

					if (!avatarImg || !avatarLoaded) {
						ctx.fillStyle = "#ffffff";
						let e1x = sx + 8,
							e1y = sy + 8;
						let e2x = sx + 22,
							e2y = sy + 8;

						if (direction === "DOWN") {
							e1x = sx + 8;
							e1y = sy + 22;
							e2x = sx + 22;
							e2y = sy + 22;
						} else if (direction === "LEFT") {
							e1x = sx + 8;
							e1y = sy + 8;
							e2x = sx + 8;
							e2y = sy + 22;
						} else if (direction === "RIGHT") {
							e1x = sx + 22;
							e1y = sy + 8;
							e2x = sx + 22;
							e2y = sy + 22;
						}

						ctx.beginPath();
						ctx.arc(e1x, e1y, 3, 0, Math.PI * 2);
						ctx.arc(e2x, e2y, 3, 0, Math.PI * 2);
						ctx.fill();
					}
				} else {
					ctx.fillStyle = COLORS.snakeBody;
					ctx.strokeStyle = COLORS.snakeBorder;
					ctx.lineWidth = 2.5;

					ctx.beginPath();
					ctx.roundRect(headX, headY, headSize, headSize, 5);
					ctx.fill();
					ctx.stroke();
				}
			});

			particles.forEach((p) => {
				ctx.save();
				ctx.globalAlpha = p.alpha;
				ctx.fillStyle = p.color;
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
				ctx.fill();
				ctx.restore();
			});
		}

		function gameLoop(timestamp: number) {
			const elapsed = timestamp - lastTickTime;

			if (gameState === "playing") {
				if (elapsed >= tickInterval) {
					lastTickTime = timestamp;
					updateGame();
				}
				interpolationProgress = Math.min(1, elapsed / tickInterval);
			} else {
				interpolationProgress = 1;
			}

			updateParticles();
			draw(interpolationProgress);
			animationFrameId = requestAnimationFrame(gameLoop);
		}

		animationFrameId = requestAnimationFrame(gameLoop);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			cancelAnimationFrame(animationFrameId);
		};
	});

	function resetGameAction() {
		if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
		if ((window as any).startArcadeSnake) {
			(window as any).startArcadeSnake();
		}
	}

	function toggleFullscreen() {
		if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
		if (!gameContainerRef) return;
		if (!document.fullscreenElement) {
			gameContainerRef.requestFullscreen().catch((err) => {
				console.error(`Error attempting fullscreen: ${err.message}`);
			});
		} else {
			document.exitFullscreen();
		}
	}
</script>

<Flex alignItems="center" marginTop="medium" direction="column" gap="medium">
	<div
		bind:this={gameContainerRef}
		style="width: 95%; max-width: 1050px; aspect-ratio: 16/9; border-radius: {token.global.radius
			.huge}; overflow: hidden; position: relative; background: #1e2229; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 12px 40px rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08);">
		<div
			style="position: absolute; top: 18px; left: 24px; right: 24px; color: #f8fafc; font-family: {token
				.global.font.family.sans}; font-weight: {token.global.font.weight.bold}; font-size: {token
				.global.font.size
				.medium}; display: flex; justify-content: space-between; pointer-events: none; z-index: 10; align-items: center; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">
			<div
				style="background: rgba(0,0,0,0.4); padding: 6px 14px; border-radius: 10px; backdrop-filter: blur(4px);">
				Score: {score}
			</div>
			<div
				style="background: rgba(0,0,0,0.4); padding: 6px 14px; border-radius: 10px; backdrop-filter: blur(4px);">
				High Score: {highScore}
			</div>
		</div>

		<canvas
			bind:this={canvasRef}
			width={VIEW_WIDTH}
			height={VIEW_HEIGHT}
			style="width: 100%; height: 100%; object-fit: contain;">
		</canvas>

		{#if gameState === "menu"}
			<div
				style="position: absolute; inset: 0; background: rgba(15,23,42,0.85); backdrop-filter: blur(8px); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; z-index: 20; color: white; padding: 24px; text-align: center;">
				<h1
					style="font-size: 2.8rem; font-weight: 800; margin: 0; letter-spacing: -0.5px; background: linear-gradient(135deg, #6366f1, #a855f7); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
					Arcade Snake
				</h1>
				<p style="margin: 0; opacity: 0.75; font-size: 1rem;">
					Smooth glide movement • Arrow keys / WASD to move • Space to pause
				</p>

				<Flex direction="column" gap="small" alignItems="center">
					<div style="display: flex; gap: 10px; align-items: center;">
						<span style="font-size: 0.85rem; font-weight: 600; opacity: 0.8;">Mode:</span>
						{#each ["classic", "portal", "obstacles"] as m}
							<button
								onclick={() => (selectedMode = m as GameMode)}
								style="padding: 8px 16px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: {selectedMode ===
								m
									? '#4f46e5'
									: 'rgba(255,255,255,0.06)'}; color: white; cursor: pointer; font-weight: bold; text-transform: capitalize; transition: 0.2s;">
								{m}
							</button>
						{/each}
					</div>

					<div style="display: flex; gap: 10px; align-items: center;">
						<span style="font-size: 0.85rem; font-weight: 600; opacity: 0.8;">Speed:</span>
						{#each ["slow", "normal", "fast", "insane"] as d}
							<button
								onclick={() => (selectedDifficulty = d as Difficulty)}
								style="padding: 8px 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: {selectedDifficulty ===
								d
									? '#db2777'
									: 'rgba(255,255,255,0.06)'}; color: white; cursor: pointer; font-weight: bold; text-transform: capitalize; transition: 0.2s;">
								{d}
							</button>
						{/each}
					</div>
				</Flex>

				<Button onclick={resetGameAction} iconbefore="play_arrow">Start Game</Button>
			</div>
		{:else if gameState === "paused"}
			<div
				style="position: absolute; inset: 0; background: rgba(15,23,42,0.7); backdrop-filter: blur(6px); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; z-index: 20; color: white;">
				<h2 style="font-size: 2.2rem; margin: 0; font-weight: 700;">Paused</h2>
				<Button onclick={() => (gameState = "playing")} iconbefore="play_arrow">Resume</Button>
			</div>
		{:else if gameState === "gameover"}
			<div
				style="position: absolute; inset: 0; background: rgba(15,23,42,0.9); backdrop-filter: blur(8px); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; z-index: 20; color: white; text-align: center;">
				<h2 style="font-size: 2.4rem; color: #f87171; margin: 0; font-weight: 800;">Game Over</h2>
				<p style="margin: 0; font-size: 1.1rem; opacity: 0.9;">
					Apples Eaten: <b>{applesEaten}</b>
				</p>
				<p style="margin: 0 0 12px 0; font-size: 1.1rem; opacity: 0.9;">
					Final Score: <b>{score}</b>
				</p>
				<Button onclick={resetGameAction} iconbefore="refresh">Play Again</Button>
			</div>
		{/if}
	</div>

	<Flex height="fit-content" width="fit-content" gap="small">
		<LinkButton href="/games" iconbefore="arrow_back">Back</LinkButton>
		<Button onclick={resetGameAction} iconbefore="refresh">Restart</Button>
		<Button onclick={toggleFullscreen} iconbefore="fullscreen">Fullscreen</Button>
	</Flex>

	<Flex
		width="fit-content"
		height="fit-content"
		alignItems="center"
		style="color: {token.theme.color.text.tertiary}"
		gap="xsmall"
		verticalAlign="middle">
		<Icon icon="star_shine" />Arcade Snake generated with AI!
	</Flex>
</Flex>
