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

	$effect(() => {
		(async () => {
			await whenAuthReady();
			if (!authState.isLoggedIn && !authState.loading) {
				window.location.href = `${PUBLIC_ACCOUNT_FRONTEND_URL}/login?continue=${encodeURIComponent(page.url.href)}`;
			}
		})();
	});

	// Game state
	type Player = "X" | "O";
	type GameMode = "bot" | "pvp";

	let board = $state<(Player | null)[]>(Array(9).fill(null));
	let currentPlayer = $state<Player>("X");
	let winner = $state<Player | "draw" | null>(null);
	let gameMode = $state<GameMode>("bot");

	const winningCombinations = [
		[0, 1, 2],
		[3, 4, 5],
		[6, 7, 8], // Rows
		[0, 3, 6],
		[1, 4, 7],
		[2, 5, 8], // Columns
		[0, 4, 8],
		[2, 4, 6] // Diagonals
	];

	function checkWinner(currentBoard: (Player | null)[]): Player | "draw" | null {
		for (const combo of winningCombinations) {
			const [a, b, c] = combo;
			if (
				currentBoard[a] &&
				currentBoard[a] === currentBoard[b] &&
				currentBoard[a] === currentBoard[c]
			) {
				return currentBoard[a];
			}
		}
		if (currentBoard.every((cell) => cell !== null)) {
			return "draw";
		}
		return null;
	}

	function makeMove(index: number) {
		if (board[index] !== null || winner !== null) return;
		if (gameMode === "bot" && currentPlayer === "O") return; // Prevent clicking during bot turn

		board[index] = currentPlayer;
		winner = checkWinner(board);

		if (winner === null) {
			currentPlayer = currentPlayer === "X" ? "O" : "X";

			// If playing against bot and it's O's turn
			if (gameMode === "bot" && currentPlayer === "O") {
				setTimeout(makeBotMove, 400);
			}
		}
	}

	function makeBotMove() {
		if (winner !== null) return;

		// Find available spots
		const emptyIndices = board
			.map((val, idx) => (val === null ? idx : null))
			.filter((val): val is number => val !== null);

		if (emptyIndices.length === 0) return;

		// Simple AI: Try to win, block player, or pick random
		let selectedIndex = -1;

		// 1. Check if bot can win
		for (const idx of emptyIndices) {
			const tempBoard = [...board];
			tempBoard[idx] = "O";
			if (checkWinner(tempBoard) === "O") {
				selectedIndex = idx;
				break;
			}
		}

		// 2. Check if player can win and block them
		if (selectedIndex === -1) {
			for (const idx of emptyIndices) {
				const tempBoard = [...board];
				tempBoard[idx] = "X";
				if (checkWinner(tempBoard) === "X") {
					selectedIndex = idx;
					break;
				}
			}
		}

		// 3. Otherwise pick a random available spot
		if (selectedIndex === -1) {
			const randomIndex = Math.floor(Math.random() * emptyIndices.length);
			selectedIndex = emptyIndices[randomIndex];
		}

		board[selectedIndex] = "O";
		winner = checkWinner(board);

		if (winner === null) {
			currentPlayer = "X";
		}
	}

	function resetGame() {
		board = Array(9).fill(null);
		currentPlayer = "X";
		winner = null;
	}

	function toggleMode(mode: GameMode) {
		gameMode = mode;
		resetGame();
	}
</script>

<Flex
	alignItems="center"
	marginTop="medium"
	direction="column"
	gap="medium"
	style="width: 100%; padding-bottom: 2rem;">
	<!-- Isolated Clean Game Window Card -->
	<div
		style="width: 90vw; max-width: 500px; background: #18181b; border: 1px solid {token.theme.color
			.border?.default || '#27272a'}; border-radius: {token.global.radius
			.huge}; padding: 1.5rem; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.2rem; box-sizing: border-box; box-shadow: 0 12px 30px rgba(0,0,0,0.5);">
		<!-- Game Controls / Mode Switcher -->
		<Flex direction="row" gap="small" alignItems="center">
			<Button
				onclick={() => toggleMode("bot")}
				style={gameMode === "bot" ? "font-weight: bold;" : ""}>
				vs Bot
			</Button>
			<Button
				onclick={() => toggleMode("pvp")}
				style={gameMode === "pvp" ? "font-weight: bold;" : ""}>
				Split Screen (PvP)
			</Button>
		</Flex>

		<!-- Status Header -->
		<div
			style="font-size: 1.2rem; font-weight: 500; color: {token.theme.color.text
				.primary}; text-align: center;">
			{#if winner}
				{#if winner === "draw"}
					It's a draw!
				{:else}
					Player {winner} wins!
				{/if}
			{:else}
				Current turn: {currentPlayer}
				{gameMode === "bot" && currentPlayer === "O" ? "(Bot is thinking...)" : ""}
			{/if}
		</div>

		<!-- Tic-Tac-Toe Grid Container -->
		<div
			style="background: #09090b; padding: 1rem; border-radius: {token.global.radius
				.medium}; border: 2px solid {token.theme.color.border?.default ||
				'#333'}; display: flex; align-items: center; justify-content: center;">
			<div
				style="display: grid; grid-template-columns: repeat(3, 90px); grid-template-rows: repeat(3, 90px); gap: 8px;">
				{#each board as cell, index}
					<button
						onclick={() => makeMove(index)}
						style="
                            background: {token.theme.color.surface?.default || '#1e1e1e'}; 
                            border: 2px solid {token.theme.color.border?.default || '#333'}; 
                            border-radius: {token.global.radius.medium};
                            font-size: 2.5rem;
                            font-weight: bold;
                            color: {cell === 'X' ? '#4f46e5' : '#ec4899'};
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            transition: background 0.2s;
                        ">
						{cell ?? ""}
					</button>
				{/each}
			</div>
		</div>
	</div>

	<!-- Bottom Actions -->
	<Flex height="fit-content" width="fit-content" gap="small">
		<LinkButton href="/games" iconbefore="arrow_back">Back</LinkButton>
		<Button onclick={resetGame} iconbefore="refresh">Reset</Button>
		<Button onclick={() => {}} iconbefore="fullscreen">Fullscreen</Button>
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
