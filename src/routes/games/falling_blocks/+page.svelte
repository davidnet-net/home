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
	import { untrack } from "svelte";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { PUBLIC_ACCOUNT_FRONTEND_URL } from "$env/static/public";
	import { token } from "@davidnet-net/svelte-ui/tokens";

	// --- Types ---
	type Matrix = number[][];

	interface Piece {
		matrix: Matrix;
		x: number;
		y: number;
	}

	// --- State ---
	let canvasRef = $state<HTMLCanvasElement | undefined>();
	let nextCanvasRef = $state<HTMLCanvasElement | undefined>();
	let gameContainerRef = $state<HTMLDivElement | undefined>();

	let score = $state(0);
	let level = $state(1);
	let lines = $state(0);
	let gameOver = $state(false);
	let isPaused = $state(false);
	let resetSignal = $state(0);

	// --- Game Constants ---
	const COLS = 10;
	const ROWS = 20;
	const BLOCK_SIZE = 24;

	const COLORS = [
		null,
		"#00d8ff", // I - Cyan
		"#0055ff", // J - Blue
		"#ff8800", // L - Orange
		"#ffcc00", // O - Yellow
		"#00cc44", // S - Green
		"#aa00ff", // T - Purple
		"#ff0044" // Z - Red
	];

	const SHAPES = [
		null,
		[
			[0, 0, 0, 0],
			[1, 1, 1, 1],
			[0, 0, 0, 0],
			[0, 0, 0, 0]
		], // I
		[
			[2, 0, 0],
			[2, 2, 2],
			[0, 0, 0]
		], // J
		[
			[0, 0, 3],
			[3, 3, 3],
			[0, 0, 0]
		], // L
		[
			[4, 4],
			[4, 4]
		], // O
		[
			[0, 5, 5],
			[5, 5, 0],
			[0, 0, 0]
		], // S
		[
			[0, 6, 0],
			[6, 6, 6],
			[0, 0, 0]
		], // T
		[
			[7, 7, 0],
			[0, 7, 7],
			[0, 0, 0]
		] // Z
	];

	$effect(() => {
		(async () => {
			await whenAuthReady();
			if (!authState.isLoggedIn && !authState.loading) {
				window.location.href = `${PUBLIC_ACCOUNT_FRONTEND_URL}/login?continue=${encodeURIComponent(page.url.href)}`;
			}
		})();
	});

	// --- Main Game Effect ---
	$effect(() => {
		if (!canvasRef || !nextCanvasRef) return;
		const ctx = canvasRef.getContext("2d");
		const nextCtx = nextCanvasRef.getContext("2d");
		if (!ctx || !nextCtx) return;

		const _trigger = resetSignal;

		if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}

		let animationFrameId: number;
		let board: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

		let dropCounter = 0;
		let dropInterval = 1000;
		let lastTime = 0;

		function createPiece(typeId: number): Piece {
			const matrix = SHAPES[typeId] as Matrix;
			return {
				matrix,
				x: Math.floor(COLS / 2) - Math.floor(matrix[0].length / 2),
				y: 0
			};
		}

		let player: Piece = createPiece(Math.floor(Math.random() * 7) + 1);
		let nextPiece: Piece = createPiece(Math.floor(Math.random() * 7) + 1);

		function collide(boardMatrix: number[][], playerPiece: Piece, offsetX = 0, offsetY = 0) {
			const m = playerPiece.matrix;
			for (let y = 0; y < m.length; y++) {
				for (let x = 0; x < m[y].length; x++) {
					if (
						m[y][x] !== 0 &&
						(boardMatrix[y + playerPiece.y + offsetY] &&
							boardMatrix[y + playerPiece.y + offsetY][x + playerPiece.x + offsetX]) !== 0
					) {
						return true;
					}
				}
			}
			return false;
		}

		function merge() {
			player.matrix.forEach((row, y) => {
				row.forEach((value, x) => {
					if (value !== 0) {
						board[y + player.y][x + player.x] = value;
					}
				});
			});
		}

		function rotate(matrix: Matrix, dir: number) {
			for (let y = 0; y < matrix.length; ++y) {
				for (let x = 0; x < y; ++x) {
					[matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
				}
			}
			if (dir > 0) {
				matrix.forEach((row) => row.reverse());
			} else {
				matrix.reverse();
			}
		}

		function playerRotate(dir: number) {
			const pos = player.x;
			let offset = 1;
			rotate(player.matrix, dir);

			while (collide(board, player)) {
				player.x += offset;
				offset = -(offset + (offset > 0 ? 1 : -1));
				if (offset > player.matrix[0].length) {
					rotate(player.matrix, -dir);
					player.x = pos;
					return;
				}
			}
		}

		function playerDrop() {
			player.y++;
			if (collide(board, player)) {
				player.y--;
				merge();
				spawnNext();
				arenaSweep();
			}
			dropCounter = 0;
		}

		function playerHardDrop() {
			while (!collide(board, player)) {
				player.y++;
			}
			player.y--;
			merge();
			spawnNext();
			arenaSweep();
			dropCounter = 0;
		}

		function playerMove(offset: number) {
			player.x += offset;
			if (collide(board, player)) {
				player.x -= offset;
			}
		}

		function spawnNext() {
			player = nextPiece;
			nextPiece = createPiece(Math.floor(Math.random() * 7) + 1);
			if (collide(board, player)) {
				gameOver = true;
			}
		}

		function arenaSweep() {
			let rowCount = 0;
			outer: for (let y = board.length - 1; y >= 0; y--) {
				for (let x = 0; x < board[y].length; x++) {
					if (board[y][x] === 0) continue outer;
				}
				const row = board.splice(y, 1)[0].fill(0);
				board.unshift(row);
				y++;
				rowCount++;
			}

			if (rowCount > 0) {
				lines += rowCount;
				const lineScores = [0, 40, 100, 300, 1200];
				score += lineScores[rowCount] * untrack(() => level);
				level = Math.floor(lines / 10) + 1;
				dropInterval = Math.max(100, 1000 - (untrack(() => level) - 1) * 75);
			}
		}

		const handleKeyDown = (e: KeyboardEvent) => {
			if (untrack(() => gameOver)) return;

			if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
				e.preventDefault();
			}

			if (e.key === "p" || e.key === "P" || e.key === "Escape") {
				isPaused = !isPaused;
				return;
			}

			if (untrack(() => isPaused)) return;

			switch (e.key) {
				case "ArrowLeft":
				case "a":
					playerMove(-1);
					break;
				case "ArrowRight":
				case "d":
					playerMove(1);
					break;
				case "ArrowDown":
				case "s":
					playerDrop();
					score += 1;
					break;
				case "ArrowUp":
				case "w":
					playerRotate(1);
					break;
				case " ":
					playerHardDrop();
					break;
			}
		};

		window.addEventListener("keydown", handleKeyDown);

		function drawMatrix(
			matrix: Matrix,
			offsetX: number,
			offsetY: number,
			context: CanvasRenderingContext2D,
			alpha: number = 1
		) {
			matrix.forEach((row, y) => {
				row.forEach((value, x) => {
					if (value !== 0) {
						context.fillStyle = COLORS[value]!;
						context.globalAlpha = alpha;
						context.fillRect(
							(x + offsetX) * BLOCK_SIZE,
							(y + offsetY) * BLOCK_SIZE,
							BLOCK_SIZE,
							BLOCK_SIZE
						);
						context.globalAlpha = 1;

						context.strokeStyle = "rgba(0,0,0,0.5)";
						context.lineWidth = 2;
						context.strokeRect(
							(x + offsetX) * BLOCK_SIZE,
							(y + offsetY) * BLOCK_SIZE,
							BLOCK_SIZE,
							BLOCK_SIZE
						);

						context.fillStyle = "rgba(255,255,255,0.2)";
						context.fillRect(
							(x + offsetX) * BLOCK_SIZE,
							(y + offsetY) * BLOCK_SIZE,
							BLOCK_SIZE,
							BLOCK_SIZE / 4
						);
					}
				});
			});
		}

		function drawNextPiece() {
			if (!nextCtx || !nextCanvasRef) return;
			nextCtx.fillStyle = "#0f172a";
			nextCtx.fillRect(0, 0, nextCanvasRef.width, nextCanvasRef.height);

			const m = nextPiece.matrix;
			const offsetX = (4 - m[0].length) / 2;
			const offsetY = (4 - m.length) / 2;
			drawMatrix(m, offsetX, offsetY + 0.5, nextCtx);
		}

		function draw() {
			if (!ctx || !canvasRef) return;

			ctx.fillStyle = "#0f172a";
			ctx.fillRect(0, 0, canvasRef.width, canvasRef.height);

			ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
			ctx.lineWidth = 1;
			for (let i = 0; i <= COLS; i++) {
				ctx.beginPath();
				ctx.moveTo(i * BLOCK_SIZE, 0);
				ctx.lineTo(i * BLOCK_SIZE, canvasRef.height);
				ctx.stroke();
			}
			for (let i = 0; i <= ROWS; i++) {
				ctx.beginPath();
				ctx.moveTo(0, i * BLOCK_SIZE);
				ctx.lineTo(canvasRef.width, i * BLOCK_SIZE);
				ctx.stroke();
			}

			drawMatrix(board, 0, 0, ctx);

			const isG = untrack(() => gameOver);
			const isP = untrack(() => isPaused);

			if (!isG && !isP) {
				let ghostY = player.y;
				while (!collide(board, player, 0, ghostY - player.y + 1)) {
					ghostY++;
				}
				drawMatrix(player.matrix, player.x, ghostY, ctx, 0.15);
				drawMatrix(player.matrix, player.x, player.y, ctx);
			}

			if (isP) {
				ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
				ctx.fillRect(0, 0, canvasRef.width, canvasRef.height);
				ctx.fillStyle = "#ffffff";
				ctx.font = "bold 24px sans-serif";
				ctx.textAlign = "center";
				ctx.fillText("PAUSED", canvasRef.width / 2, canvasRef.height / 2);
			}

			if (isG) {
				ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
				ctx.fillRect(0, 0, canvasRef.width, canvasRef.height);
				ctx.fillStyle = "#ff0044";
				ctx.font = "bold 28px sans-serif";
				ctx.textAlign = "center";
				ctx.fillText("GAME OVER", canvasRef.width / 2, canvasRef.height / 2);
			}

			drawNextPiece();
		}

		function gameLoop(time = 0) {
			const deltaTime = time - lastTime;
			lastTime = time;

			const isG = untrack(() => gameOver);
			const isP = untrack(() => isPaused);

			if (!isG && !isP) {
				dropCounter += deltaTime;
				if (dropCounter > dropInterval) {
					playerDrop();
				}
			}

			draw();
			animationFrameId = requestAnimationFrame(gameLoop);
		}

		gameLoop();

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			cancelAnimationFrame(animationFrameId);
		};
	});

	function resetGame() {
		if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
		score = 0;
		level = 1;
		lines = 0;
		gameOver = false;
		isPaused = false;
		resetSignal += 1;
	}

	function togglePause() {
		if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
		if (!gameOver) isPaused = !isPaused;
	}
</script>

<Flex alignItems="center" marginTop="medium" direction="column" gap="large">
	<Flex direction="row" gap="xlarge" alignItems="start" justifyContent="center" width="fit-content">
		<!-- Game Board Canvas -->
		<div
			style="border: 4px solid {token.theme.color.border
				.focus}; border-radius: 8px; overflow: hidden; background: #0f172a; box-shadow: 0px 8px 24px rgba(0,0,0,0.4);">
			<canvas bind:this={canvasRef} width="240" height="480" style="display: block;"></canvas>
		</div>

		<!-- UI & Stats Side Panel -->
		<Flex
			direction="column"
			gap="medium"
			style="width: 140px;"
			height="fit-content"
			width="fit-content">
			<div
				style="background: {token.theme.color.surface.default.normal}; padding: {token.global
					.spacing.medium}; border-radius: {token.global.radius.large}; border: 1px solid {token
					.theme.color.border.focus};">
				<div
					style="font-weight: {token.global.font.weight.bold}; font-size: {token.global.font.size
						.small}; color: {token.theme.color.text.secondary}; margin-bottom: 8px;">
					NEXT
				</div>
				<div
					style="background: #0f172a; border-radius: 4px; overflow: hidden; display: flex; justify-content: center; align-items: center; border: 1px solid {token
						.theme.color.border.default};">
					<canvas bind:this={nextCanvasRef} width="96" height="96" style="display: block;"></canvas>
				</div>
			</div>

			<div
				style="background: {token.theme.color.surface.default.normal}; padding: {token.global
					.spacing.medium}; border-radius: {token.global.radius.large}; border: 1px solid {token
					.theme.color.border.focus};">
				<div
					style="font-weight: {token.global.font.weight.bold}; font-size: {token.global.font.size
						.small}; color: {token.theme.color.text.secondary};">
					SCORE
				</div>
				<div
					style="font-size: {token.global.font.size.large}; font-weight: {token.global.font.weight
						.bold}; color: {token.theme.color.text.primary};">
					{score}
				</div>
			</div>

			<div
				style="background: {token.theme.color.surface.default.normal}; padding: {token.global
					.spacing.medium}; border-radius: {token.global.radius.large}; border: 1px solid {token
					.theme.color.border.focus};">
				<div
					style="font-weight: {token.global.font.weight.bold}; font-size: {token.global.font.size
						.small}; color: {token.theme.color.text.secondary};">
					LEVEL
				</div>
				<div
					style="font-size: {token.global.font.size.large}; font-weight: {token.global.font.weight
						.bold}; color: {token.theme.color.text.primary};">
					{level}
				</div>
			</div>

			<div
				style="background: {token.theme.color.surface.default.normal}; padding: {token.global
					.spacing.medium}; border-radius: {token.global.radius.large}; border: 1px solid {token
					.theme.color.border.focus};">
				<div
					style="font-weight: {token.global.font.weight.bold}; font-size: {token.global.font.size
						.small}; color: {token.theme.color.text.secondary};">
					LINES
				</div>
				<div
					style="font-size: {token.global.font.size.large}; font-weight: {token.global.font.weight
						.bold}; color: {token.theme.color.text.primary};">
					{lines}
				</div>
			</div>
		</Flex>
	</Flex>

	<!-- Controls / Action Bar -->
	<Flex height="fit-content" width="fit-content" gap="small">
		<LinkButton href="/games" iconbefore="arrow_back">Back</LinkButton>
		<Button onclick={togglePause} iconbefore={isPaused ? "play_arrow" : "pause"}>
			{isPaused ? "Resume" : "Pause"}
		</Button>
		<Button onclick={resetGame} iconbefore="refresh">Reset</Button>
	</Flex>

	<!-- Context & Instructions -->
	<Flex
		width="fit-content"
		height="fit-content"
		direction="column"
		alignItems="center"
		style="color: {token.theme.color.text.tertiary}; font-size: {token.global.font.size
			.small}; text-align: center;"
		gap="xsmall">
		<div>
			<Icon icon="keyboard" />
			<b>Arrows/WASD</b>
			to Move & Rotate •
			<b>Space</b>
			to Hard Drop •
			<b>P</b>
			to Pause
		</div>
		<div><Icon icon="star_shine" /> Game logic and engine generated with AI!</div>
	</Flex>
</Flex>
