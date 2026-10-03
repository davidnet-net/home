<script lang="ts">
	import {
		Anchor,
		authState,
		Avatar,
		Button,
		deleteFetch,
		Flex,
		getFetch,
		Icon,
		IconButton,
		identityState,
		LinkButton,
		Lozenge,
		Modal,
		patchFetch,
		postFetch,
		Spinner,
		TextArea,
		TextField,
		toast,
		whenAuthReady	} from "@davidnet-net/svelte-ui";
	// Zorg dat ReportModal geëxporteerd is vanuit je svelte-ui package
	import { ReportModal } from "@davidnet-net/svelte-ui";
	import { token } from "@davidnet-net/svelte-ui/tokens";
	import { onDestroy, onMount } from "svelte";

	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { PUBLIC_ACCOUNT_FRONTEND_URL, PUBLIC_BACKEND_URL } from "$env/static/public";

	const GAME_SDK_SOURCE = "davidnet-game-sdk";
	const ALLOWED_SDK_TYPES = new Set([
		"applyHighscore",
		"getHighscores",
		"saveJsonBlob",
		"getJsonBlob"
	]);

	let gameId = page.params.id;
	let gameData = $state<any>(null);
	let loading = $state(true);
	let errorMessage = $state("");

	// Like states
	let isLiked = $state(false);
	let likesCount = $state(0);
	let isLiking = $state(false);

	let iframeRef: HTMLIFrameElement | undefined = $state();
	let showDeleteModal = $state(false);
	let isDeleting = $state(false);

	let isReportModalOpen = $state(false);

	const isCreator = $derived(
		identityState.user?.username && gameData?.creator === identityState.user.username
	);

	// --- Highscores / leaderboard ---
	let playerHighscore = $state<number | null>(null);
	let globalHighscore = $state<{
		userId: string;
		username: string;
		displayName: string;
		avatarUrl: string;
		score: number;
		rank: number;
	} | null>(null);
	let leaderboard = $state<any[]>([]);
	let isLeaderboardOpen = $state(false);
	let isLoadingLeaderboard = $state(false);

	// --- Wipe save ---
	let showWipeModal = $state(false);
	let isWiping = $state(false);

	// --- Manage player data (creator / moderator only) ---
	let isManageOpen = $state(false);
	let managePlayers = $state<any[]>([]);
	let isLoadingManage = $state(false);
	let editingHighscoreUserId = $state<string | null>(null);
	let editingHighscoreValue = $state("");
	let editingSaveUserId = $state<string | null>(null);
	let editingSaveValue = $state("");
	let savingManageAction = $state(false);

	// --- "Actions applied to me" audit log ---
	let isAuditLogOpen = $state(false);
	let auditLogEntries = $state<any[]>([]);
	let isLoadingAuditLog = $state(false);

	$effect(() => {
		(async () => {
			await whenAuthReady();
			if (!authState.isLoggedIn && !authState.loading) {
				window.location.href = `${PUBLIC_ACCOUNT_FRONTEND_URL}/login?continue=${encodeURIComponent(page.url.href)}`;
			}
		})();
	});

	onMount(async () => {
		window.addEventListener("message", handleGameMessage);

		await whenAuthReady();
		try {
			const result = await getFetch(
				`${PUBLIC_BACKEND_URL}/social/community-games/${gameId}`,
				undefined,
				{},
				true
			);
			if (result.success) {
				gameData = result.game;
				isLiked = Boolean(result.game.isLiked);
				likesCount = result.game.likesCount ?? 0;
			} else {
				errorMessage = "Game not found.";
			}
		} catch (err) {
			errorMessage = "Failed to load game data.";
		} finally {
			loading = false;
		}

		loadHighscores();
	});

	onDestroy(() => {
		if (typeof window !== "undefined") {
			window.removeEventListener("message", handleGameMessage);
		}
	});

	function resetGame() {
		if (iframeRef) {
			iframeRef.src = iframeRef.src;
		}
	}

	function toggleFullscreen() {
		if (iframeRef) {
			if (iframeRef.requestFullscreen) {
				iframeRef.requestFullscreen();
			}
		}
	}

	async function toggleLike() {
		if (isLiking) return;
		isLiking = true;

		const targetState = !isLiked;

		isLiked = targetState;
		likesCount += targetState ? 1 : -1;

		try {
			const result = await postFetch(
				`${PUBLIC_BACKEND_URL}/social/community-games/${gameId}/like`,
				{ liked: targetState },
				{},
				true
			);

			if (result.success) {
				likesCount = result.likesCount;
			} else {
				isLiked = !targetState;
				likesCount += targetState ? -1 : 1;
				toast("Error", "Could not update like.", "error", 3000, "danger");
			}
		} catch (err) {
			isLiked = !targetState;
			likesCount += targetState ? -1 : 1;
			toast("Error", "Network error while liking.", "error", 3000, "danger");
		} finally {
			isLiking = false;
		}
	}

	async function executeDelete() {
		isDeleting = true;
		try {
			const result = await deleteFetch(
				`${PUBLIC_BACKEND_URL}/social/community-games/${gameId}`,
				undefined,
				{},
				true
			);
			if (result.success) {
				toast("Deleted", "Game has been deleted.", "delete", 4000, "success");
				goto("/games/community");
			} else {
				toast("Error", "Could not delete game.", "error", 4000, "danger");
			}
		} catch (err) {
			toast("Error", "Network error.", "error", 4000, "danger");
		} finally {
			isDeleting = false;
			showDeleteModal = false;
		}
	}

	// --- HIGHSCORES ---
	async function loadHighscores() {
		try {
			const result = await getFetch(
				`${PUBLIC_BACKEND_URL}/social/community-games/${gameId}/highscores`,
				undefined,
				{},
				true
			);
			if (result.success) {
				playerHighscore = result.playerHighscore;
				globalHighscore = result.globalHighscore;
				leaderboard = result.leaderboard;
			}
		} catch (err) {
			// Silently ignore: highscores are a non-critical enhancement to the play page.
		}
	}

	async function openLeaderboard() {
		isLeaderboardOpen = true;
		isLoadingLeaderboard = true;
		await loadHighscores();
		isLoadingLeaderboard = false;
	}

	// --- WIPE SAVE ---
	async function executeWipeSave() {
		isWiping = true;
		try {
			const result = await deleteFetch(
				`${PUBLIC_BACKEND_URL}/social/community-games/${gameId}/save`,
				undefined,
				{},
				true
			);
			if (result.success) {
				toast(
					"Save wiped",
					"Your save data for this game was deleted.",
					"delete_sweep",
					4000,
					"success"
				);
			} else {
				toast("Error", "Could not wipe your save.", "error", 4000, "danger");
			}
		} catch (err) {
			toast("Error", "Network error while wiping your save.", "error", 4000, "danger");
		} finally {
			isWiping = false;
			showWipeModal = false;
		}
	}

	// --- MANAGE PLAYER DATA (creator / moderator) ---
	async function openManage() {
		isManageOpen = true;
		editingHighscoreUserId = null;
		editingSaveUserId = null;
		await loadManagePlayers();
	}

	async function loadManagePlayers() {
		isLoadingManage = true;
		try {
			const result = await getFetch(
				`${PUBLIC_BACKEND_URL}/social/community-games/${gameId}/manage/players`,
				undefined,
				{},
				true
			);
			if (result.success) {
				managePlayers = result.players;
			} else {
				toast("Error", "Could not load player data.", "error", 4000, "danger");
			}
		} catch (err) {
			toast("Error", "Network error while loading player data.", "error", 4000, "danger");
		} finally {
			isLoadingManage = false;
		}
	}

	function startEditHighscore(player: any) {
		editingHighscoreUserId = player.userId;
		editingHighscoreValue = String(player.highscore ?? 0);
	}

	async function confirmEditHighscore(player: any) {
		const score = Number(editingHighscoreValue);
		if (!Number.isFinite(score) || score < 0) {
			toast("Invalid score", "Enter a non-negative number.", "error", 3000, "danger");
			return;
		}

		savingManageAction = true;
		try {
			const result = await patchFetch(
				`${PUBLIC_BACKEND_URL}/social/community-games/${gameId}/manage/highscores/${player.userId}`,
				{ score },
				{},
				true
			);
			if (result.success) {
				player.highscore = score;
				editingHighscoreUserId = null;
				toast("Updated", "Highscore updated.", "check_circle", 3000, "success");
			} else {
				toast("Error", "Could not update highscore.", "error", 4000, "danger");
			}
		} finally {
			savingManageAction = false;
		}
	}

	async function deletePlayerHighscore(player: any) {
		savingManageAction = true;
		try {
			const result = await deleteFetch(
				`${PUBLIC_BACKEND_URL}/social/community-games/${gameId}/manage/highscores/${player.userId}`,
				undefined,
				{},
				true
			);
			if (result.success) {
				player.highscore = null;
				toast("Deleted", "Highscore deleted.", "delete", 3000, "success");
			} else {
				toast("Error", "Could not delete highscore.", "error", 4000, "danger");
			}
		} finally {
			savingManageAction = false;
		}
	}

	function startEditSave(player: any) {
		editingSaveUserId = player.userId;
		editingSaveValue = JSON.stringify(player.save ?? {}, null, 2);
	}

	async function confirmEditSave(player: any) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(editingSaveValue);
		} catch {
			toast("Invalid JSON", "Fix the JSON before saving.", "error", 4000, "danger");
			return;
		}

		savingManageAction = true;
		try {
			const result = await patchFetch(
				`${PUBLIC_BACKEND_URL}/social/community-games/${gameId}/manage/saves/${player.userId}`,
				{ data: parsed },
				{},
				true
			);
			if (result.success) {
				player.save = parsed;
				editingSaveUserId = null;
				toast("Updated", "Save data updated.", "check_circle", 3000, "success");
			} else {
				toast("Error", "Could not update save data.", "error", 4000, "danger");
			}
		} finally {
			savingManageAction = false;
		}
	}

	async function deletePlayerSave(player: any) {
		savingManageAction = true;
		try {
			const result = await deleteFetch(
				`${PUBLIC_BACKEND_URL}/social/community-games/${gameId}/manage/saves/${player.userId}`,
				undefined,
				{},
				true
			);
			if (result.success) {
				player.save = null;
				toast("Deleted", "Save data deleted.", "delete", 3000, "success");
			} else {
				toast("Error", "Could not delete save data.", "error", 4000, "danger");
			}
		} finally {
			savingManageAction = false;
		}
	}

	// --- AUDIT LOG: actions other creators/mods applied to MY data ---
	async function openAuditLog() {
		isAuditLogOpen = true;
		isLoadingAuditLog = true;
		try {
			const result = await getFetch(
				`${PUBLIC_BACKEND_URL}/social/community-games/audit-log/mine`,
				undefined,
				{},
				true
			);
			if (result.success) {
				auditLogEntries = result.entries;
			}
		} finally {
			isLoadingAuditLog = false;
		}
	}

	function describeAuditAction(action: string): string {
		switch (action) {
			case "view_save":
				return "viewed the player data overview";
			case "edit_save":
				return "edited your save data";
			case "delete_save":
				return "deleted your save data";
			case "edit_highscore":
				return "edited your highscore";
			case "delete_highscore":
				return "deleted your highscore";
			default:
				return action;
		}
	}

	// --- POSTMESSAGE BRIDGE: forwards window.DavidnetSDK calls from the sandboxed iframe to the backend ---
	function handleGameMessage(event: MessageEvent) {
		if (!iframeRef || event.source !== iframeRef.contentWindow) return;

		const msg = event.data;
		if (
			!msg ||
			msg.source !== GAME_SDK_SOURCE ||
			!msg.requestId ||
			!ALLOWED_SDK_TYPES.has(msg.type)
		) {
			return;
		}

		handleSdkRequest(msg).catch(() => {
			respondToGame(msg.requestId, false, undefined, "Unexpected error");
		});
	}

	function respondToGame(requestId: string, success: boolean, data?: unknown, error?: string) {
		iframeRef?.contentWindow?.postMessage(
			{ source: GAME_SDK_SOURCE, requestId, success, data, error },
			"*"
		);
	}

	async function handleSdkRequest(msg: any) {
		if (msg.type === "applyHighscore") {
			const score = Number(msg.payload?.score);
			if (!Number.isFinite(score) || score < 0) {
				return respondToGame(msg.requestId, false, undefined, "Invalid score");
			}

			const result = await postFetch(
				`${PUBLIC_BACKEND_URL}/social/community-games/${gameId}/highscore`,
				{ score },
				{},
				true
			);

			if (!result.success) {
				return respondToGame(
					msg.requestId,
					false,
					undefined,
					result.code || "Failed to submit score"
				);
			}

			playerHighscore = result.playerHighscore;
			if (result.isNewGlobalBest) await loadHighscores();

			return respondToGame(msg.requestId, true, {
				score: result.score,
				playerHighscore: result.playerHighscore,
				globalHighscore: result.globalHighscore,
				isNewPersonalBest: result.isNewPersonalBest,
				isNewGlobalBest: result.isNewGlobalBest
			});
		}

		if (msg.type === "getHighscores") {
			const result = await getFetch(
				`${PUBLIC_BACKEND_URL}/social/community-games/${gameId}/highscores`,
				undefined,
				{},
				true
			);

			if (!result.success) {
				return respondToGame(
					msg.requestId,
					false,
					undefined,
					result.code || "Failed to fetch highscores"
				);
			}

			playerHighscore = result.playerHighscore;
			globalHighscore = result.globalHighscore;
			leaderboard = result.leaderboard;

			return respondToGame(msg.requestId, true, {
				playerHighscore: result.playerHighscore,
				globalHighscore: result.globalHighscore,
				leaderboard: result.leaderboard
			});
		}

		if (msg.type === "saveJsonBlob") {
			const result = await postFetch(
				`${PUBLIC_BACKEND_URL}/social/community-games/${gameId}/save`,
				{ data: msg.payload?.data },
				{},
				true
			);

			if (!result.success) {
				return respondToGame(msg.requestId, false, undefined, result.code || "Failed to save");
			}

			return respondToGame(msg.requestId, true, { savedAt: result.savedAt });
		}

		if (msg.type === "getJsonBlob") {
			const result = await getFetch(
				`${PUBLIC_BACKEND_URL}/social/community-games/${gameId}/save`,
				undefined,
				{},
				true
			);

			if (!result.success) {
				return respondToGame(msg.requestId, false, undefined, result.code || "Failed to load save");
			}

			return respondToGame(msg.requestId, true, { data: result.data, updatedAt: result.updatedAt });
		}
	}
</script>

{#if showDeleteModal}
	<Modal title="Delete Game" onclose={() => (showDeleteModal = false)}>
		<p>
			Are you sure you want to permanently delete <strong>{gameData?.title}</strong>
			? This cannot be undone.
		</p>

		{#snippet actions()}
			<Flex gap="small" justifyContent="end">
				<Button appearance="default" onclick={() => (showDeleteModal = false)}>Cancel</Button>
				<Button appearance="danger" loading={isDeleting} onclick={executeDelete}>
					Delete permanently
				</Button>
			</Flex>
		{/snippet}
	</Modal>
{/if}

{#if showWipeModal}
	<Modal title="Wipe your save data" onclose={() => (showWipeModal = false)}>
		<p>
			This deletes <strong>your</strong>
			save data (and only your save data) for
			<strong>{gameData?.title}</strong>
			. Your highscore is not affected. This cannot be undone.
		</p>

		{#snippet actions()}
			<Flex gap="small" justifyContent="end">
				<Button appearance="default" onclick={() => (showWipeModal = false)}>Cancel</Button>
				<Button appearance="danger" loading={isWiping} onclick={executeWipeSave}>
					Wipe my save
				</Button>
			</Flex>
		{/snippet}
	</Modal>
{/if}

{#if isLeaderboardOpen}
	<Modal title="Leaderboard" onclose={() => (isLeaderboardOpen = false)}>
		{#if isLoadingLeaderboard}
			<Flex justifyContent="center" alignItems="center" height="200px">
				<Spinner size="medium" />
			</Flex>
		{:else}
			<Flex direction="column" gap="medium">
				<Flex direction="column" gap="xsmall">
					<span style="color: {token.theme.color.text.tertiary}">Your highscore</span>
					<span style="font-size: 1.4rem; font-weight: bold;">{playerHighscore ?? "—"}</span>
				</Flex>

				<Flex direction="column" gap="xsmall">
					{#each leaderboard as entry (entry.userId)}
						<Flex alignItems="center" gap="small" style="padding: 6px 0;">
							<span style="width: 1.5rem; font-weight: bold;">#{entry.rank}</span>
							<Avatar size="small" src={entry.avatarUrl} alt={entry.username} />
							<span style="flex: 1;">@{entry.username}</span>
							<span style="font-weight: bold;">{entry.score}</span>
						</Flex>
					{:else}
						<p style="color: {token.theme.color.text.tertiary}">
							No scores submitted yet. Be the first!
						</p>
					{/each}
				</Flex>
			</Flex>
		{/if}

		{#snippet actions()}
			<Flex justifyContent="end">
				<Button onclick={() => (isLeaderboardOpen = false)}>Close</Button>
			</Flex>
		{/snippet}
	</Modal>
{/if}

{#if isAuditLogOpen}
	<Modal title="Actions applied to my data" onclose={() => (isAuditLogOpen = false)}>
		<p style="color: {token.theme.color.text.secondary}">
			These are actions game creators or moderators have taken on your save data or highscores,
			across all community games.
		</p>

		{#if isLoadingAuditLog}
			<Flex justifyContent="center" alignItems="center" height="150px">
				<Spinner size="medium" />
			</Flex>
		{:else}
			<Flex direction="column" gap="small">
				{#each auditLogEntries as entry (entry.id)}
					<Flex
						direction="column"
						gap="xsmall"
						style="padding: 8px; background: {token.theme.color.surface
							.raised}; border-radius: 6px;">
						<span>
							<strong>@{entry.creatorUsername}</strong>
							{describeAuditAction(entry.action)} in
							<strong>{entry.gameTitle}</strong>
						</span>
						<span style="color: {token.theme.color.text.tertiary}; font-size: 0.85rem;">
							{new Date(entry.createdAt).toLocaleString()}
						</span>
					</Flex>
				{:else}
					<p style="color: {token.theme.color.text.tertiary}">
						No actions have been applied to your data yet.
					</p>
				{/each}
			</Flex>
		{/if}

		{#snippet actions()}
			<Flex justifyContent="end">
				<Button onclick={() => (isAuditLogOpen = false)}>Close</Button>
			</Flex>
		{/snippet}
	</Modal>
{/if}

{#if isManageOpen}
	<Modal title="Manage player data" onclose={() => (isManageOpen = false)}>
		<p style="color: {token.theme.color.text.secondary}">
			As the creator (or a moderator), you can view, edit and delete any player's save data and
			highscore. Every action here is written to an audit log the affected player can see.
		</p>

		{#if isLoadingManage}
			<Flex justifyContent="center" alignItems="center" height="200px">
				<Spinner size="medium" />
			</Flex>
		{:else}
			<Flex direction="column" gap="medium" style="max-height: 50vh; overflow-y: auto;">
				{#each managePlayers as p (p.userId)}
					<Flex
						direction="column"
						gap="small"
						style="padding: 10px; border: 1px solid {token.theme.color.border
							.default}; border-radius: 8px;">
						<Flex alignItems="center" gap="small">
							<Avatar size="small" src={p.avatarUrl} alt={p.username} />
							<span style="font-weight: bold;">@{p.username}</span>
						</Flex>

						<Flex alignItems="center" gap="small">
							<span style="color: {token.theme.color.text.tertiary}">Highscore:</span>
							{#if editingHighscoreUserId === p.userId}
								<TextField bind:value={editingHighscoreValue} type="number" />
								<IconButton
									icon="check"
									tip="Confirm"
									disabled={savingManageAction}
									onclick={() => confirmEditHighscore(p)} />
								<IconButton
									icon="close"
									tip="Cancel"
									onclick={() => (editingHighscoreUserId = null)} />
							{:else}
								<span style="font-weight: bold;">{p.highscore ?? "—"}</span>
								<IconButton
									icon="edit"
									tip="Edit highscore"
									onclick={() => startEditHighscore(p)} />
								{#if p.highscore !== null}
									<IconButton
										icon="delete"
										tip="Delete highscore"
										appearance="danger"
										disabled={savingManageAction}
										onclick={() => deletePlayerHighscore(p)} />
								{/if}
							{/if}
						</Flex>

						<Flex direction="column" gap="xsmall">
							<Flex alignItems="center" gap="small">
								<span style="color: {token.theme.color.text.tertiary}">Save data:</span>
								<Lozenge appearance={p.save ? "success" : "default"}>
									{p.save ? "Has save" : "No save"}
								</Lozenge>
								{#if editingSaveUserId !== p.userId}
									<IconButton
										icon="data_object"
										tip="View / edit save data"
										onclick={() => startEditSave(p)} />
									{#if p.save}
										<IconButton
											icon="delete"
											tip="Delete save data"
											appearance="danger"
											disabled={savingManageAction}
											onclick={() => deletePlayerSave(p)} />
									{/if}
								{/if}
							</Flex>

							{#if editingSaveUserId === p.userId}
								<TextArea bind:value={editingSaveValue} maxRows={10} />
								<Flex gap="small">
									<Button
										appearance="primary"
										loading={savingManageAction}
										onclick={() => confirmEditSave(p)}>
										Save changes
									</Button>
									<Button onclick={() => (editingSaveUserId = null)}>Cancel</Button>
								</Flex>
							{/if}
						</Flex>
					</Flex>
				{:else}
					<p style="color: {token.theme.color.text.tertiary}">
						No players have submitted a save or highscore yet.
					</p>
				{/each}
			</Flex>
		{/if}

		{#snippet actions()}
			<Flex justifyContent="end">
				<Button onclick={() => (isManageOpen = false)}>Close</Button>
			</Flex>
		{/snippet}
	</Modal>
{/if}

{#if gameId}
	<ReportModal bind:isOpen={isReportModalOpen} reportType="game" reportedId={gameId} />
{/if}

<Flex alignItems="center" marginTop="medium" marginBottom="giant" direction="column" gap="medium">
	{#if loading}
		<Flex justifyContent="center" alignItems="center" height="70vh">
			<Spinner size="large" />
		</Flex>
	{:else if errorMessage}
		<Flex direction="column" alignItems="center" gap="medium" marginTop="giant">
			<p style="color: {token.theme.color.text.danger}">{errorMessage}</p>
			<LinkButton href="/games/community" iconbefore="arrow_back">Back</LinkButton>
		</Flex>
	{:else if gameData}
		<iframe
			bind:this={iframeRef}
			sandbox="allow-scripts allow-popups allow-forms allow-pointer-lock"
			allow="autoplay; fullscreen; focus-without-user-activation"
			style="height: 75vh; width: 90%; border: 2px solid {token.theme.color.border
				.default}; border-radius: {token.global.radius.huge}; background: #000;"
			src="{PUBLIC_BACKEND_URL}/social/community-games/{gameId}/file/index.html"
			title={gameData.title}>
		</iframe>

		<Flex direction="column" alignItems="center" gap="small" width="90%">
			<Flex
				height="fit-content"
				width="fit-content"
				gap="small"
				justifyContent="center"
				flexWrap="wrap">
				<LinkButton href="/games/community" appearance="default" iconbefore="arrow_back">
					Back
				</LinkButton>
				<Button onclick={resetGame} iconbefore="refresh">Reset</Button>
				<Button onclick={toggleFullscreen} iconbefore="fullscreen">Fullscreen</Button>

				<Button
					onclick={toggleLike}
					disabled={isLiking}
					appearance={isLiked ? "primary" : "default"}
					iconbefore="favorite">
					{likesCount}
					{likesCount === 1 ? "Like" : "Likes"}
				</Button>

				<Button onclick={openLeaderboard} iconbefore="leaderboard">Leaderboard</Button>

				<Button
					appearance="subtle"
					iconbefore="delete_sweep"
					onclick={() => (showWipeModal = true)}>
					Wipe save
				</Button>

				<Button appearance="subtle" iconbefore="history" onclick={openAuditLog}>
					Data action log
				</Button>

				<Button appearance="subtle" iconbefore="flag" onclick={() => (isReportModalOpen = true)}>
					Report
				</Button>

				{#if isCreator}
					<Button iconbefore="manage_accounts" onclick={openManage}>Manage player data</Button>
					<Button appearance="danger" onclick={() => (showDeleteModal = true)} iconbefore="delete">
						Delete
					</Button>
				{/if}
			</Flex>

			<Flex
				width="fit-content"
				height="fit-content"
				alignItems="center"
				justifyContent="center"
				style="color: {token.theme.color.text.tertiary}"
				gap="xsmall">
				<Icon icon="attribution" />
				<span>
					Game is created by
					<Anchor href="{PUBLIC_ACCOUNT_FRONTEND_URL}/profile/{gameData.creator}">
						@{gameData.creator}
					</Anchor>
				</span>
				{#if gameData.isAiGenerated}
					<Lozenge appearance="discover">🤖 Fully AI-generated</Lozenge>
				{/if}
			</Flex>

			{#if gameData.description}
				<p
					style="color: {token.theme.color.text
						.secondary}; max-width: 600px; margin: 0; text-align: center;">
					{gameData.description}
				</p>
			{/if}

			<Flex
				gap="large"
				justifyContent="center"
				alignItems="center"
				marginTop="small"
				flexWrap="wrap"
				style="padding: 10px 16px; background: {token.theme.color.surface
					.raised}; border-radius: {token.global.radius.medium};">
				<Flex direction="column" alignItems="center" gap="xsmall">
					<span style="color: {token.theme.color.text.tertiary}; font-size: 0.85rem;">
						Your highscore
					</span>
					<span style="font-size: 1.3rem; font-weight: bold;">{playerHighscore ?? "—"}</span>
				</Flex>

				<Flex direction="column" alignItems="center" gap="xsmall">
					<span style="color: {token.theme.color.text.tertiary}; font-size: 0.85rem;">
						🏆 Global #1
					</span>
					{#if globalHighscore}
						<span style="font-size: 1.3rem; font-weight: bold;">
							{globalHighscore.score}
							<span style="font-size: 0.9rem; font-weight: normal;">
								(@{globalHighscore.username})
							</span>
						</span>
					{:else}
						<span style="font-size: 1.3rem; font-weight: bold;">—</span>
					{/if}
				</Flex>
			</Flex>

			<p>You may need to click fullscreen for the game to work!</p>
		</Flex>
	{/if}
</Flex>
