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
		putFetch,
		Spinner,
		TextArea,
		TextField,
		toast,
		whenAuthReady
	} from "@davidnet-net/svelte-ui";
	import { ReportModal } from "@davidnet-net/svelte-ui";
	import { token } from "@davidnet-net/svelte-ui/tokens";
	import { onDestroy, onMount } from "svelte";

	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { PUBLIC_ACCOUNT_FRONTEND_URL, PUBLIC_BACKEND_URL } from "$env/static/public";

	const GAME_SDK_SOURCE = "davidnet-game-sdk";
	const ALLOWED_SDK_TYPES = new Set([
		"startSession",
		"applyHighscore",
		"getHighscores",
		"saveJsonBlob",
		"getJsonBlob",
		"realtimeConnect",
		"realtimeJoinRoom",
		"realtimeLeaveRoom",
		"realtimeSend",
		"realtimeJoinQueue",
		"realtimeLeaveQueue"
	]);

	const REALTIME_MAX_MESSAGE_BYTES = 64 * 1024;

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

	// --- Update game files (creator only) ---
	let showUpdateModal = $state(false);
	let isUpdating = $state(false);
	let updateFiles = $state<FileList | null>(null);
	let updateErrorMessage = $state("");

	let isReportModalOpen = $state(false);

	const isCreator = $derived(
		identityState.user?.username && gameData?.creator === identityState.user.username
	);

	// --- Highscores / leaderboard ---
	let playerHighscore = $state<number | null>(null);
	let playerHighscoreFlagged = $state(false);
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

	// --- Ban status check ---
	async function checkUserBanStatus() {
		if (!authState.isLoggedIn) return;
		try {
			const res = await getFetch(
				`${PUBLIC_BACKEND_URL}/support/moderation/me/ban-status`,
				{},
				undefined,
				true
			);
			if (res.code === "BANNED" || (res.success && res.isBanned)) {
				window.location.href = `https://davidnet.net/moderation/banned?until=${encodeURIComponent(res.bannedUntil)}`;
			}
		} catch (err) {
			console.error("Failed to check ban status:", err);
		}
	}

	function checkBanResponse(res: any) {
		if (res && res.code === "BANNED") {
			window.location.href = `https://davidnet.net/moderation/banned?until=${encodeURIComponent(res.bannedUntil)}`;
			return true;
		}
		return false;
	}

	$effect(() => {
		(async () => {
			await whenAuthReady();
			if (!authState.isLoggedIn && !authState.loading) {
				window.location.href = `${PUBLIC_ACCOUNT_FRONTEND_URL}/login?continue=${encodeURIComponent(page.url.href)}`;
			} else {
				await checkUserBanStatus();
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
			if (checkBanResponse(result)) return;

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
		disconnectRealtime();
	});

	function resetGame() {
		if (iframeRef) {
			iframeRef.src = iframeRef.src;
		}
		// A fresh session needs its own user gesture to (re-)enter fullscreen, so show the
		// click-to-play overlay again rather than silently staying windowed after a reset.
		hasStartedPlaying = false;
	}

	function toggleFullscreen() {
		if (iframeRef && iframeRef.requestFullscreen) {
			iframeRef.requestFullscreen().catch(() => {});
		}
	}

	// Fullscreen can only be requested from inside a real user gesture (click/tap) - it can't be
	// forced automatically on load. This overlay's click IS that gesture: many games misbehave or
	// clip content in a small windowed iframe (not enough vertical space), so we use the player's
	// first interaction to go fullscreen immediately instead of waiting for them to find the
	// separate "Fullscreen" button.
	let hasStartedPlaying = $state(false);

	function startPlaying() {
		hasStartedPlaying = true;
		toggleFullscreen();
		iframeRef?.focus();
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

			if (checkBanResponse(result)) return;

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

			if (checkBanResponse(result)) return;

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

	// --- UPDATE GAME FILES (creator only) ---
	async function executeUpdateGame() {
		if (!updateFiles || updateFiles.length === 0) {
			updateErrorMessage = "Please select a .zip file containing your updated game.";
			return;
		}

		isUpdating = true;
		updateErrorMessage = "";
		try {
			const formData = new FormData();
			formData.append("game", updateFiles[0]);

			const result = await putFetch(
				`${PUBLIC_BACKEND_URL}/social/community-games/${gameId}/upload`,
				formData,
				undefined,
				true
			);

			if (checkBanResponse(result)) return;

			if (result.success) {
				toast("Updated", "Game files have been updated.", "check_circle", 4000, "success");
				showUpdateModal = false;
				updateFiles = null;
				resetGame();
			} else {
				updateErrorMessage = result.message || result.code || "Failed to update game.";
				toast("Update Failed", updateErrorMessage, "error", 4000, "danger");
			}
		} catch (err) {
			updateErrorMessage = "A network error occurred during the update.";
			toast("Error", "Network error while updating the game.", "error", 4000, "danger");
		} finally {
			isUpdating = false;
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

			if (checkBanResponse(result)) return;

			if (result.success) {
				playerHighscore = result.playerHighscore;
				playerHighscoreFlagged = Boolean(result.playerHighscoreFlagged);
				globalHighscore = result.globalHighscore;
				leaderboard = result.leaderboard;
			}
		} catch (err) {
			// Silently ignore
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

			if (checkBanResponse(result)) return;

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

			if (checkBanResponse(result)) return;

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

			if (checkBanResponse(result)) return;

			if (result.success) {
				player.highscore = score;
				player.highscoreFlagged = false;
				editingHighscoreUserId = null;
				toast("Updated", "Highscore updated.", "check_circle", 3000, "success");
			} else {
				toast("Error", "Could not update highscore.", "error", 4000, "danger");
			}
		} finally {
			savingManageAction = false;
		}
	}

	async function approveHighscore(player: any) {
		savingManageAction = true;
		try {
			const result = await postFetch(
				`${PUBLIC_BACKEND_URL}/social/community-games/${gameId}/manage/highscores/${player.userId}/approve`,
				{},
				{},
				true
			);

			if (checkBanResponse(result)) return;

			if (result.success) {
				player.highscoreFlagged = false;
				toast(
					"Approved",
					"Highscore is now visible on the public leaderboard.",
					"check_circle",
					3000,
					"success"
				);
			} else {
				toast("Error", "Could not approve highscore.", "error", 4000, "danger");
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

			if (checkBanResponse(result)) return;

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

			if (checkBanResponse(result)) return;

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

			if (checkBanResponse(result)) return;

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

	// --- AUDIT LOG ---
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

			if (checkBanResponse(result)) return;

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

	// --- REALTIME ---
	let realtimeSocket: WebSocket | null = null;
	let realtimeConnectPromise: Promise<void> | null = null;
	let realtimeReconnectAttempts = 0;
	let realtimeReconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let realtimeExplicitlyClosed = false;
	const realtimePendingAcks = new Map<string, (frame: any) => void>();
	const realtimeJoinedRooms = new Set<string>();

	function realtimeWsUrl(): string {
		return `${PUBLIC_BACKEND_URL.replace(/^http/, "ws")}/websockets/community-games/${gameId}/realtime`;
	}

	function sendRealtimeFrame(frame: Record<string, unknown>) {
		if (realtimeSocket && realtimeSocket.readyState === WebSocket.OPEN) {
			realtimeSocket.send(JSON.stringify(frame));
		}
	}

	function emitRealtimeEvent(eventName: string, payload: unknown) {
		iframeRef?.contentWindow?.postMessage(
			{ source: GAME_SDK_SOURCE, type: "event", event: eventName, payload },
			"*"
		);
	}

	function connectRealtime(): Promise<void> {
		if (realtimeSocket && realtimeSocket.readyState === WebSocket.OPEN) return Promise.resolve();
		if (realtimeConnectPromise) return realtimeConnectPromise;

		realtimeExplicitlyClosed = false;

		realtimeConnectPromise = new Promise((resolve, reject) => {
			let settled = false;
			const socket = new WebSocket(realtimeWsUrl());
			realtimeSocket = socket;

			socket.onopen = () => {
				realtimeReconnectAttempts = 0;
				realtimeConnectPromise = null;
				settled = true;

				const rejoined: string[] = [];
				for (const room of realtimeJoinedRooms) {
					sendRealtimeFrame({ type: "join", room });
					rejoined.push(room);
				}
				if (rejoined.length > 0) emitRealtimeEvent("reconnect", { rooms: rejoined });

				resolve();
			};

			socket.onmessage = (event) => {
				let frame: any;
				try {
					frame = JSON.parse(event.data);
				} catch {
					return;
				}

				if (frame.type === "ping") {
					sendRealtimeFrame({ type: "pong" });
					return;
				}

				if (frame.type === "ack") {
					const resolver = realtimePendingAcks.get(frame.reqId);
					if (resolver) {
						realtimePendingAcks.delete(frame.reqId);
						resolver(frame);
					}
					return;
				}

				if (frame.type === "presence") {
					emitRealtimeEvent("presence", {
						room: frame.room,
						event: frame.event,
						member: frame.member
					});
					return;
				}

				if (frame.type === "message") {
					emitRealtimeEvent("message", {
						room: frame.room,
						data: frame.data,
						from: frame.from,
						ts: frame.ts
					});
					return;
				}

				if (frame.type === "matched") {
					realtimeJoinedRooms.add(frame.room);
					emitRealtimeEvent("matched", {
						queue: frame.queue,
						room: frame.room,
						members: frame.members
					});
					return;
				}

				if (frame.type === "error") {
					emitRealtimeEvent("error", { code: frame.code, message: frame.message });
				}
			};

			socket.onclose = () => {
				realtimeConnectPromise = null;
				realtimePendingAcks.forEach((resolver) => resolver({ ok: false, code: "DISCONNECTED" }));
				realtimePendingAcks.clear();
				if (realtimeSocket === socket) realtimeSocket = null;

				emitRealtimeEvent("disconnect", {});

				if (!settled) reject(new Error("Realtime connection failed"));

				if (!realtimeExplicitlyClosed) {
					const delay = Math.min(10000, 1000 * Math.pow(2, realtimeReconnectAttempts));
					realtimeReconnectAttempts += 1;
					realtimeReconnectTimer = setTimeout(() => {
						connectRealtime().catch(() => {});
					}, delay);
				}
			};

			socket.onerror = () => {
				if (!settled) {
					settled = true;
					reject(new Error("Realtime connection failed"));
				}
			};
		});

		return realtimeConnectPromise;
	}

	function disconnectRealtime() {
		realtimeExplicitlyClosed = true;
		if (realtimeReconnectTimer) clearTimeout(realtimeReconnectTimer);
		realtimeJoinedRooms.clear();
		realtimeSocket?.close(1000, "Client disconnect");
		realtimeSocket = null;
	}

	// --- POSTMESSAGE BRIDGE ---
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
		if (msg.type === "startSession") {
			const result = await postFetch(
				`${PUBLIC_BACKEND_URL}/social/community-games/${gameId}/session/start`,
				{},
				{},
				true
			);

			if (checkBanResponse(result)) return;

			if (!result.success) {
				return respondToGame(
					msg.requestId,
					false,
					undefined,
					result.code || "Failed to start session"
				);
			}

			return respondToGame(msg.requestId, true, {
				sessionId: result.sessionId,
				secret: result.secret,
				expiresAt: result.expiresAt
			});
		}

		if (msg.type === "applyHighscore") {
			const score = Number(msg.payload?.score);
			if (!Number.isFinite(score) || score < 0) {
				return respondToGame(msg.requestId, false, undefined, "Invalid score");
			}

			const result = await postFetch(
				`${PUBLIC_BACKEND_URL}/social/community-games/${gameId}/highscore`,
				{
					score,
					sessionId: msg.payload?.sessionId,
					timestamp: msg.payload?.timestamp,
					signature: msg.payload?.signature
				},
				{},
				true
			);

			if (checkBanResponse(result)) return;

			if (!result.success) {
				return respondToGame(
					msg.requestId,
					false,
					undefined,
					result.code || "Failed to submit score"
				);
			}

			playerHighscore = result.playerHighscore;
			playerHighscoreFlagged = Boolean(result.playerHighscoreFlagged);
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

			if (checkBanResponse(result)) return;

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
				{
					data: msg.payload?.data,
					sessionId: msg.payload?.sessionId,
					timestamp: msg.payload?.timestamp,
					signature: msg.payload?.signature
				},
				{},
				true
			);

			if (checkBanResponse(result)) return;

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

			if (checkBanResponse(result)) return;

			if (!result.success) {
				return respondToGame(msg.requestId, false, undefined, result.code || "Failed to load save");
			}

			return respondToGame(msg.requestId, true, { data: result.data, updatedAt: result.updatedAt });
		}

		if (msg.type === "realtimeConnect") {
			try {
				await connectRealtime();
				return respondToGame(msg.requestId, true, {});
			} catch {
				return respondToGame(msg.requestId, false, undefined, "Failed to connect");
			}
		}

		if (msg.type === "realtimeJoinRoom") {
			const room = String(msg.payload?.room ?? "");
			if (!room) return respondToGame(msg.requestId, false, undefined, "Missing room");

			try {
				await connectRealtime();
			} catch {
				return respondToGame(msg.requestId, false, undefined, "Not connected");
			}

			const reqId = msg.requestId;
			realtimePendingAcks.set(reqId, (frame) => {
				if (frame.ok) {
					realtimeJoinedRooms.add(room);
					respondToGame(reqId, true, { room: frame.room, members: frame.members });
				} else {
					respondToGame(reqId, false, undefined, frame.code || "Failed to join room");
				}
			});
			sendRealtimeFrame({ reqId, type: "join", room });
			return;
		}

		if (msg.type === "realtimeLeaveRoom") {
			const room = String(msg.payload?.room ?? "");
			realtimeJoinedRooms.delete(room);

			if (!realtimeSocket || realtimeSocket.readyState !== WebSocket.OPEN) {
				return respondToGame(msg.requestId, true, { room });
			}

			const reqId = msg.requestId;
			realtimePendingAcks.set(reqId, (frame) => {
				respondToGame(reqId, Boolean(frame.ok), { room });
			});
			sendRealtimeFrame({ reqId, type: "leave", room });
			return;
		}

		if (msg.type === "realtimeSend") {
			const room = String(msg.payload?.room ?? "");
			const data = msg.payload?.data;
			const echo = Boolean(msg.payload?.echo);

			if (!room) return respondToGame(msg.requestId, false, undefined, "Missing room");
			if (JSON.stringify(data ?? null).length > REALTIME_MAX_MESSAGE_BYTES) {
				return respondToGame(msg.requestId, false, undefined, "Message too large");
			}

			try {
				await connectRealtime();
			} catch {
				return respondToGame(msg.requestId, false, undefined, "Not connected");
			}

			sendRealtimeFrame({ type: "send", room, data, echo });
			return respondToGame(msg.requestId, true, {});
		}

		if (msg.type === "realtimeJoinQueue") {
			const queue = String(msg.payload?.queue ?? "");
			const groupSize = Number(msg.payload?.groupSize);
			const metadata = msg.payload?.metadata;

			if (!queue || !Number.isInteger(groupSize) || groupSize < 1) {
				return respondToGame(msg.requestId, false, undefined, "Invalid queue or groupSize");
			}

			try {
				await connectRealtime();
			} catch {
				return respondToGame(msg.requestId, false, undefined, "Not connected");
			}

			const reqId = msg.requestId;
			realtimePendingAcks.set(reqId, (frame) => {
				if (frame.ok) {
					respondToGame(reqId, true, { queue: frame.queue, position: frame.position });
				} else {
					respondToGame(reqId, false, undefined, frame.code || "Failed to join queue");
				}
			});
			sendRealtimeFrame({ reqId, type: "joinQueue", queue, groupSize, metadata });
			return;
		}

		if (msg.type === "realtimeLeaveQueue") {
			const queue = String(msg.payload?.queue ?? "");

			if (!realtimeSocket || realtimeSocket.readyState !== WebSocket.OPEN) {
				return respondToGame(msg.requestId, true, { queue });
			}

			const reqId = msg.requestId;
			realtimePendingAcks.set(reqId, (frame) => {
				respondToGame(reqId, Boolean(frame.ok), { queue });
			});
			sendRealtimeFrame({ reqId, type: "leaveQueue", queue });
			return;
		}
	}
</script>

{#if showUpdateModal}
	<Modal
		title="Update game files"
		onclose={() => {
			showUpdateModal = false;
			updateFiles = null;
			updateErrorMessage = "";
		}}>
		<p>
			Upload a new .zip to replace <strong>{gameData?.title}</strong>
			's files. It must contain an <strong>index.html</strong>
			at the root, same as the original upload. Your highscores, saves and icon are kept - only
			the game files themselves are replaced.
		</p>

		<input
			type="file"
			accept=".zip,application/zip"
			bind:files={updateFiles}
			disabled={isUpdating}
			style="margin-top: 12px;" />

		{#if updateErrorMessage}
			<p style="color: {token.theme.color.text.danger}; margin-top: 8px;">{updateErrorMessage}</p>
		{/if}

		{#snippet actions()}
			<Flex gap="small" justifyContent="end">
				<Button
					appearance="default"
					onclick={() => {
						showUpdateModal = false;
						updateFiles = null;
						updateErrorMessage = "";
					}}>
					Cancel
				</Button>
				<Button appearance="primary" loading={isUpdating} onclick={executeUpdateGame}>
					Upload new version
				</Button>
			</Flex>
		{/snippet}
	</Modal>
{/if}

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
					{#if playerHighscoreFlagged}
						<span style="color: {token.theme.color.text.tertiary}; font-size: 0.85rem;">
							⏳ Under review — this score is unusually high, so it's hidden from the public
							leaderboard until a moderator checks it.
						</span>
					{/if}
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
								{#if p.highscoreFlagged}
									<Lozenge appearance="warning">
										<span title={p.highscoreFlagReason}>⚠ Flagged</span>
									</Lozenge>
									<IconButton
										icon="check_circle"
										tip="Approve — show on public leaderboard as-is"
										disabled={savingManageAction}
										onclick={() => approveHighscore(p)} />
								{/if}
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
								<TextArea bind:value={editingSaveValue} rows={10} />
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
		<!-- Zorg dat je deze Iframe code meeneemt in je kopie! -->
		<div style="position: relative; width: 90%;">
			<iframe
				bind:this={iframeRef}
				sandbox="allow-scripts allow-popups allow-forms allow-pointer-lock"
				allow="autoplay; fullscreen; focus-without-user-activation"
				csp="default-src * https: http: 'unsafe-inline' 'unsafe-eval' data: blob:; img-src * https: http: data: blob:; media-src * https: http: data: blob:; font-src * https: http: data:; style-src * https: http: 'unsafe-inline'; script-src * https: http: 'unsafe-inline' 'unsafe-eval'; connect-src 'self';"
				style="height: 75vh; width: 100%; display: block; background: #000; border: 2px solid {token
					.theme.color.border.default}; border-radius: {token.global.radius.huge};"
				src="{PUBLIC_BACKEND_URL}/social/community-games/{gameId}/file/index.html"
				title={gameData.title}>
			</iframe>

			{#if !hasStartedPlaying}
				<button
					onclick={startPlaying}
					style="position: absolute; inset: 0; width: 100%; height: 100%; border: none; padding: 0;
						border-radius: {token.global.radius.huge}; background: rgba(0, 0, 0, 0.55); color: white;
						display: flex; flex-direction: column; align-items: center; justify-content: center;
						gap: 8px; cursor: pointer; font-size: 1.1rem; font-weight: 600;">
					<Icon icon="play_circle" size="huge" />
					<span>Click to play (fullscreen)</span>
				</button>
			{/if}
		</div>

		<!-- Centrale wrapper voor alles eronder -->
		<Flex direction="column" alignItems="center" gap="medium" width="90%">
			<!-- 1. Strakke Toolbar op één rij -->
			<Flex
				height="fit-content"
				width="100%"
				gap="small"
				justifyContent="center"
				alignItems="center"
				flexWrap="wrap">
				<!-- Primaire acties -->
				<LinkButton href="/games/community" appearance="default" iconbefore="arrow_back">
					Back
				</LinkButton>
				<Button onclick={resetGame} iconbefore="refresh">Reset</Button>
				<Button onclick={toggleFullscreen} iconbefore="fullscreen">Fullscreen</Button>

				<div
					style="width: 1px; height: 24px; background: {token.theme.color.border
						.default}; margin: 0 4px;">
				</div>

				<!-- Social & Stats -->
				<Button
					onclick={toggleLike}
					disabled={isLiking}
					appearance={isLiked ? "primary" : "default"}
					iconbefore="favorite">
					{likesCount}
					{likesCount === 1 ? "Like" : "Likes"}
				</Button>
				<Button onclick={openLeaderboard} iconbefore="leaderboard">Leaderboard</Button>

				<div
					style="width: 1px; height: 24px; background: {token.theme.color.border
						.default}; margin: 0 4px;">
				</div>

				<!-- Opties & Acties -->
				<IconButton
					icon="delete_sweep"
					tip="Wipe save data"
					onclick={() => (showWipeModal = true)} />
				<IconButton icon="history" tip="Data action log" onclick={openAuditLog} />
				<IconButton icon="flag" tip="Report game" onclick={() => (isReportModalOpen = true)} />

				{#if isCreator}
					<div
						style="width: 1px; height: 24px; background: {token.theme.color.border
							.default}; margin: 0 4px;">
					</div>
					<IconButton icon="manage_accounts" tip="Manage player data" onclick={openManage} />
					<IconButton
						icon="upload_file"
						tip="Update game files"
						onclick={() => (showUpdateModal = true)} />
					<IconButton
						icon="delete"
						tip="Delete game"
						appearance="danger"
						onclick={() => (showDeleteModal = true)} />
				{/if}
			</Flex>

			<!-- 2. Bulletproof Game Info & Highscores Card -->
			<div
				style="
                width: 100%;
                max-width: 650px;
                background: {token.theme.color.surface.raised};
                border: 1px solid {token.theme.color.border.default};
                border-radius: {token.global.radius.large};
                padding: 24px;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 16px;
                box-sizing: border-box;
            ">
				<!-- Creator Tag -->
				<Flex
					alignItems="center"
					justifyContent="center"
					gap="xsmall"
					style="color: {token.theme.color.text.tertiary}">
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

				<!-- Beschrijving (indien aanwezig) -->
				{#if gameData.description}
					<p
						style="color: {token.theme.color.text
							.secondary}; margin: 0; text-align: center; line-height: 1.5;">
						{gameData.description}
					</p>
				{/if}

				<div style="width: 100%; height: 1px; background: {token.theme.color.border.default};">
				</div>

				<!-- Highscores overzicht -->
				<div
					style="display: flex; gap: 48px; justify-content: center; align-items: center; width: 100%; flex-wrap: wrap;">
					<div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
						<span style="color: {token.theme.color.text.tertiary}; font-size: 0.85rem;">
							Your highscore
						</span>
						<span style="font-size: 1.4rem; font-weight: bold;">{playerHighscore ?? "—"}</span>
					</div>

					<div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
						<span style="color: {token.theme.color.text.tertiary}; font-size: 0.85rem;">
							🏆 Global #1
						</span>
						{#if globalHighscore}
							<span style="font-size: 1.4rem; font-weight: bold; text-align: center;">
								{globalHighscore.score}
								<span
									style="font-size: 0.9rem; font-weight: normal; color: {token.theme.color.text
										.secondary}; display: block;">
									(@{globalHighscore.username})
								</span>
							</span>
						{:else}
							<span style="font-size: 1.4rem; font-weight: bold;">—</span>
						{/if}
					</div>
				</div>
			</div>

			<p style="color: {token.theme.color.text.tertiary}; font-size: 0.85rem; margin-top: 4px;">
				You may need to click fullscreen for the game to work!
			</p>
		</Flex>
	{/if}
</Flex>
