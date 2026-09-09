<script lang="ts">
	import {
		authState,
		Flex,
		whenAuthReady,
		LinkButton,
		Button,
		Icon
	} from "@davidnet-net/svelte-ui";
	import { page } from "$app/state";
	import { PUBLIC_ACCOUNT_FRONTEND_URL } from "$env/static/public";
	import { token } from "@davidnet-net/svelte-ui/tokens";

	// --- Types ---
	type Direction = "UP" | "RIGHT" | "DOWN" | "LEFT";

	interface LaserSegment {
		x1: number;
		y1: number;
		x2: number;
		y2: number;
	}

	// --- State ---
	let canvasRef = $state<HTMLCanvasElement | undefined>();
	let gameContainerRef = $state<HTMLDivElement | undefined>();

	let score = $state(0);
	let level = $state(1);
	let levelWon = $state(false);
	let isTransitioning = $state(false);
	let fadeAlpha = $state(0);

	// --- Grid Constants ---
	const COLS = 10;
	const ROWS = 8;
	const CELL_SIZE = 50;
	const VIEW_WIDTH = COLS * CELL_SIZE;
	const VIEW_HEIGHT = ROWS * CELL_SIZE;

	// Grid types: 0 = empty, 1 = wall, 2 = mirror (\), 3 = mirror (/)
	let grid: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

	let emitter: { x: number; y: number; dir: Direction } = { x: 0, y: 3, dir: "RIGHT" };
	let target: { x: number; y: number } = { x: 9, y: 3 };

	$effect(() => {
		(async () => {
			await whenAuthReady();
			if (!authState.isLoggedIn && !authState.loading) {
				window.location.href = `${PUBLIC_ACCOUNT_FRONTEND_URL}/login?continue=${encodeURIComponent(page.url.href)}`;
			}
		})();
	});

	// --- Garandeerd Mogelijke Level Generator (Reverse-Path Bouw) ---
	function generateLevel(lvl: number) {
		levelWon = false;
		isTransitioning = false;
		grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

		const dxMap: Record<Direction, number> = { UP: 0, RIGHT: 1, DOWN: 0, LEFT: -1 };
		const dyMap: Record<Direction, number> = { UP: -1, RIGHT: 0, DOWN: 1, LEFT: 0 };
		const directions: Direction[] = ["UP", "RIGHT", "DOWN", "LEFT"];

		// 1. Kies willekeurige rand voor emitter
		const edge = Math.floor(Math.random() * 4);
		if (edge === 0) emitter = { x: 0, y: Math.floor(Math.random() * ROWS), dir: "RIGHT" };
		else if (edge === 1)
			emitter = { x: COLS - 1, y: Math.floor(Math.random() * ROWS), dir: "LEFT" };
		else if (edge === 2) emitter = { x: Math.floor(Math.random() * COLS), y: 0, dir: "DOWN" };
		else emitter = { x: Math.floor(Math.random() * COLS), y: ROWS - 1, dir: "UP" };

		// 2. Bouw een geldig oplosbaar pad vanaf emitter naar een willekeurig doel
		let cx = emitter.x;
		let cy = emitter.y;
		let cdir = emitter.dir;

		const pathCells: { x: number; y: number }[] = [{ x: cx, y: cy }];
		const numTurns = Math.min(2 + Math.floor(lvl * 0.5), 5);
		let stepsTaken = 0;

		while (stepsTaken < numTurns && pathCells.length < 30) {
			cx += dxMap[cdir];
			cy += dyMap[cdir];

			if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) {
				cx -= dxMap[cdir];
				cy -= dyMap[cdir];
				break;
			}

			pathCells.push({ x: cx, y: cy });

			if (Math.random() > 0.4 && stepsTaken < numTurns - 1) {
				const possibleTurns = directions.filter((d) => d !== cdir && d !== getOppositeDir(cdir));
				if (possibleTurns.length > 0) {
					const nextDir = possibleTurns[Math.floor(Math.random() * possibleTurns.length)];
					cdir = nextDir;
					stepsTaken++;
				}
			}
		}

		target = { x: cx, y: cy };
		if (target.x === emitter.x && target.y === emitter.y) {
			target.x = (emitter.x + 1) % COLS;
		}

		// 3. Voeg extra willekeurige muren toe die het pad NIET blokkeren
		const wallCount = Math.min(3 + Math.floor(lvl * 1.0), 15);
		let wallsPlaced = 0;
		let attempts = 0;
		while (wallsPlaced < wallCount && attempts < 100) {
			attempts++;
			const wx = Math.floor(Math.random() * COLS);
			const wy = Math.floor(Math.random() * ROWS);

			const isOnPath = pathCells.some((p) => p.x === wx && p.y === wy);
			const isStartOrEnd =
				(wx === emitter.x && wy === emitter.y) || (wx === target.x && wy === target.y);

			if (!isOnPath && !isStartOrEnd && grid[wy][wx] === 0) {
				grid[wy][wx] = 1;
				wallsPlaced++;
			}
		}
	}

	function getOppositeDir(dir: Direction): Direction {
		if (dir === "UP") return "DOWN";
		if (dir === "DOWN") return "UP";
		if (dir === "LEFT") return "RIGHT";
		return "LEFT";
	}

	// --- Raycasting Laser Engine ---
	function calculateLaserPath(): { segments: LaserSegment[]; hitTarget: boolean } {
		const segments: LaserSegment[] = [];
		let currX = emitter.x;
		let currY = emitter.y;
		let dir = emitter.dir;

		const dxMap: Record<Direction, number> = { UP: 0, RIGHT: 1, DOWN: 0, LEFT: -1 };
		const dyMap: Record<Direction, number> = { UP: -1, RIGHT: 0, DOWN: 1, LEFT: 0 };

		let hitTarget = false;
		let steps = 0;
		const maxSteps = 60;

		while (steps < maxSteps) {
			steps++;

			const startPxX = currX * CELL_SIZE + CELL_SIZE / 2;
			const startPxY = currY * CELL_SIZE + CELL_SIZE / 2;

			currX += dxMap[dir];
			currY += dyMap[dir];

			if (currX < 0 || currX >= COLS || currY < 0 || currY >= ROWS) {
				const endPxX =
					(currX - dxMap[dir]) * CELL_SIZE + CELL_SIZE / 2 + dxMap[dir] * (CELL_SIZE / 2);
				const endPxY =
					(currY - dyMap[dir]) * CELL_SIZE + CELL_SIZE / 2 + dyMap[dir] * (CELL_SIZE / 2);
				segments.push({ x1: startPxX, y1: startPxY, x2: endPxX, y2: endPxY });
				break;
			}

			const endPxX = currX * CELL_SIZE + CELL_SIZE / 2;
			const endPxY = currY * CELL_SIZE + CELL_SIZE / 2;
			segments.push({ x1: startPxX, y1: startPxY, x2: endPxX, y2: endPxY });

			if (currX === target.x && currY === target.y) {
				hitTarget = true;
				break;
			}

			const cellType = grid[currY][currX];

			if (cellType === 1) {
				break;
			}

			if (cellType === 2) {
				if (dir === "RIGHT") dir = "DOWN";
				else if (dir === "DOWN") dir = "RIGHT";
				else if (dir === "LEFT") dir = "UP";
				else if (dir === "UP") dir = "LEFT";
			}

			if (cellType === 3) {
				if (dir === "RIGHT") dir = "UP";
				else if (dir === "UP") dir = "RIGHT";
				else if (dir === "LEFT") dir = "DOWN";
				else if (dir === "DOWN") dir = "LEFT";
			}
		}

		return { segments, hitTarget };
	}

	// Start direct het eerste level bij laden
	generateLevel(level);

	// --- Main Game Effect (Alleen voor de Canvas loop en input) ---
	$effect(() => {
		if (!canvasRef) return;
		const ctx = canvasRef.getContext("2d");
		if (!ctx) return;

		let animationFrameId: number;

		function handleClick(e: MouseEvent) {
			if (isTransitioning) return;

			const rect = canvasRef!.getBoundingClientRect();
			const clickX = (e.clientX - rect.left) * (VIEW_WIDTH / rect.width);
			const clickY = (e.clientY - rect.top) * (VIEW_HEIGHT / rect.height);

			const gridX = Math.floor(clickX / CELL_SIZE);
			const gridY = Math.floor(clickY / CELL_SIZE);

			if (gridX >= 0 && gridX < COLS && gridY >= 0 && gridY < ROWS) {
				if (
					(gridX === emitter.x && gridY === emitter.y) ||
					(gridX === target.x && gridY === target.y)
				) {
					return;
				}

				if (grid[gridY][gridX] === 1) {
					return;
				}

				if (grid[gridY][gridX] === 0) grid[gridY][gridX] = 2;
				else if (grid[gridY][gridX] === 2) grid[gridY][gridX] = 3;
				else grid[gridY][gridX] = 0;
			}
		}

		canvasRef.addEventListener("click", handleClick);

		function draw() {
			ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

			ctx.fillStyle = "#0f172a";
			ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

			ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
			ctx.lineWidth = 1;
			for (let c = 0; c <= COLS; c++) {
				ctx.beginPath();
				ctx.moveTo(c * CELL_SIZE, 0);
				ctx.lineTo(c * CELL_SIZE, VIEW_HEIGHT);
				ctx.stroke();
			}
			for (let r = 0; r <= ROWS; r++) {
				ctx.beginPath();
				ctx.moveTo(0, r * CELL_SIZE);
				ctx.lineTo(VIEW_WIDTH, r * CELL_SIZE);
				ctx.stroke();
			}

			for (let r = 0; r < ROWS; r++) {
				for (let c = 0; c < COLS; c++) {
					const x = c * CELL_SIZE;
					const y = r * CELL_SIZE;

					if (grid[r][c] === 1) {
						ctx.fillStyle = "#475569";
						ctx.fillRect(x + 4, y + 4, CELL_SIZE - 8, CELL_SIZE - 8);
						ctx.strokeStyle = "#94a3b8";
						ctx.lineWidth = 2;
						ctx.strokeRect(x + 4, y + 4, CELL_SIZE - 8, CELL_SIZE - 8);
					} else if (grid[r][c] === 2) {
						ctx.strokeStyle = "#38bdf8";
						ctx.lineWidth = 4;
						ctx.beginPath();
						ctx.moveTo(x + 8, y + 8);
						ctx.lineTo(x + CELL_SIZE - 8, y + CELL_SIZE - 8);
						ctx.stroke();
					} else if (grid[r][c] === 3) {
						ctx.strokeStyle = "#f43f5e";
						ctx.lineWidth = 4;
						ctx.beginPath();
						ctx.moveTo(x + 8, y + CELL_SIZE - 8);
						ctx.lineTo(x + CELL_SIZE - 8, y + 8);
						ctx.stroke();
					}
				}
			}

			ctx.fillStyle = levelWon ? "#22c55e" : "#eab308";
			ctx.beginPath();
			ctx.arc(
				target.x * CELL_SIZE + CELL_SIZE / 2,
				target.y * CELL_SIZE + CELL_SIZE / 2,
				16,
				0,
				Math.PI * 2
			);
			ctx.fill();
			ctx.strokeStyle = "#ffffff";
			ctx.lineWidth = 2;
			ctx.stroke();

			ctx.fillStyle = "#3b82f6";
			ctx.fillRect(
				emitter.x * CELL_SIZE + 6,
				emitter.y * CELL_SIZE + 6,
				CELL_SIZE - 12,
				CELL_SIZE - 12
			);
			ctx.strokeStyle = "#ffffff";
			ctx.lineWidth = 2;
			ctx.strokeRect(
				emitter.x * CELL_SIZE + 6,
				emitter.y * CELL_SIZE + 6,
				CELL_SIZE - 12,
				CELL_SIZE - 12
			);

			const { segments, hitTarget } = calculateLaserPath();

			ctx.strokeStyle = "#ef4444";
			ctx.shadowColor = "#ef4444";
			ctx.shadowBlur = 10;
			ctx.lineWidth = 4;
			ctx.beginPath();
			segments.forEach((seg) => {
				ctx.moveTo(seg.x1, seg.y1);
				ctx.lineTo(seg.x2, seg.y2);
			});
			ctx.stroke();
			ctx.shadowBlur = 0;

			if (isTransitioning) {
				fadeAlpha = Math.min(fadeAlpha + 0.05, 1);
			} else {
				fadeAlpha = Math.max(fadeAlpha - 0.05, 0);
			}

			if (fadeAlpha > 0) {
				ctx.fillStyle = `rgba(15, 23, 42, ${fadeAlpha})`;
				ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
			}

			if (hitTarget && !levelWon && !isTransitioning) {
				levelWon = true;
				isTransitioning = true;
				score += 100;
				setTimeout(() => {
					level += 1;
					generateLevel(level);
				}, 800);
			}

			animationFrameId = requestAnimationFrame(draw);
		}

		draw();

		return () => {
			canvasRef?.removeEventListener("click", handleClick);
			cancelAnimationFrame(animationFrameId);
		};
	});

	function resetGame() {
		if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
		score = 0;
		level = 1;
		generateLevel(level);
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
			.huge}; overflow: hidden; position: relative; background: #0f172a; display: flex; flex-direction: column; align-items: center; justify-content: center;">
		<div
			style="position: absolute; top: 16px; left: 20px; color: #ffffff; font-family: {token.global
				.font.family.sans}; font-weight: {token.global.font.weight.bold}; font-size: {token.global
				.font.size.medium}; display: flex; gap: {token.global.spacing
				.large}; pointer-events: none; z-index: 10;">
			<div>Level: {level}</div>
			<div>Score: {score}</div>
		</div>

		<canvas
			bind:this={canvasRef}
			width={VIEW_WIDTH}
			height={VIEW_HEIGHT}
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
