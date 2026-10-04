<script lang="ts">
	import {
		Anchor,
		authState,
		Button,
		Checkbox,
		CodeSnippet,
		Field,
		Flex,
		Form,
		Icon,
		Link,
		Modal,
		navigateBack,
		postFetch,
		TextField,
		toast,
		whenAuthReady
	} from "@davidnet-net/svelte-ui";
	import { token } from "@davidnet-net/svelte-ui/tokens";

	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { PUBLIC_ACCOUNT_FRONTEND_URL, PUBLIC_BACKEND_URL } from "$env/static/public";

	let title = $state("");
	let description = $state("");
	let files = $state<FileList | null>(null);
	let iconFiles = $state<FileList | null>(null);
	let isAiGenerated = $state(false);
	let errorMessage = $state("");
	let isUploading = $state(false);

	let showConfirmModal = $state(false);
	let showAiGuide = $state(false);

	const sdkGuideMarkdown = `# Davidnet Community Games — Platform SDK

Your game runs inside a sandboxed iframe with no internet access, no cookies, and no real
localStorage. To add persistent highscores and save data, use the \`window.DavidnetSDK\` object —
it is automatically injected into every uploaded \`index.html\`. You do NOT need to write any
postMessage or networking code yourself; just call these functions from your game code.

## API

### DavidnetSDK.applyHighscore(score: number)
Returns a Promise resolving to:
\`{ score, playerHighscore, globalHighscore, isNewPersonalBest, isNewGlobalBest }\`
Submits a score. The server only ever keeps the HIGHEST score per player and globally, so it is
safe to call this every time the player's score might be a new best (e.g. on game over). Score
must be a non-negative integer.

### DavidnetSDK.getHighscores()
Returns a Promise resolving to:
\`{ playerHighscore, globalHighscore, leaderboard }\`
\`leaderboard\` is the top 10: \`[{ rank, userId, username, displayName, avatarUrl, score }]\`.
\`globalHighscore\` is that same shape for the #1 entry (or null if nobody has scored yet).

### DavidnetSDK.saveJsonBlob(data)
Returns a Promise resolving to: \`{ savedAt }\`
Persists any JSON-serializable value (object, array, etc.) as the player's save file — inventory,
level progress, settings, anything. Max size is about 200kb. Overwrites any previous save for this
player on this game.

### DavidnetSDK.getJsonBlob()
Returns a Promise resolving to: \`{ data, updatedAt }\`
Returns the player's previously saved value, or \`data: null\` if nothing was saved yet.

## Realtime multiplayer: DavidnetSDK.realtime

A generic, content-agnostic real-time layer: named rooms (pub/sub channels with presence) plus a
matchmaking queue. The platform never looks at what you send, so the exact same API works for a
2-player turn-based game, a 50+ player action game, or a one-way live feed (e.g. a price ticker)
with no "players" at all. There is no maximum room size, queue size, or group size.

All methods auto-connect on first use — you don't need to call \`connect()\` yourself unless you
want to open the connection early.

### DavidnetSDK.realtime.joinRoom(room: string)
Returns a Promise resolving to: \`{ room, members }\` — \`members\` is everyone already in the room
(each \`{ userId, username, displayName, avatarUrl }\`). Rooms are created on first join and
destroyed when empty — just pick a name. Join as many rooms as you like.

### DavidnetSDK.realtime.leaveRoom(room: string)
Returns a Promise resolving to: \`{ room }\`

### DavidnetSDK.realtime.send(room: string, data, options?: { echo?: boolean })
Broadcasts any JSON-serializable \`data\` to everyone else currently in \`room\` (max ~64kb). Pass
\`{ echo: true }\` to also receive your own message back via \`onMessage\`. This is fire-and-forget —
it resolves once sent, it does not wait for delivery, so call it as often as your game needs
(every input tick is fine).

### DavidnetSDK.realtime.onMessage(callback)
Fires for every message sent to any room you're in: \`{ room, data, from, ts }\`. \`from\` is the
sender's member info, or \`null\` for messages published via the server-side HTTP publish endpoint
(see below) rather than by a connected player. Returns an unsubscribe function.

### DavidnetSDK.realtime.onPresence(callback)
Fires when someone joins or leaves a room you're in: \`{ room, event: "join" | "leave", member }\`.

### DavidnetSDK.realtime.joinQueue(queue: string, groupSize: number, metadata?)
A matchmaking primitive. Returns a Promise resolving to: \`{ queue, position }\`. Everyone who calls
\`joinQueue\` with the same \`queue\` name should pass the same \`groupSize\`. As soon as \`groupSize\`
callers are waiting, the server pops them off in join order and auto-creates a room for them —
listen for it with \`onMatched\`. Use \`metadata\` (e.g. skill rating) if you want to build your own
smarter matching on top of this — the server itself does plain FIFO grouping.

### DavidnetSDK.realtime.leaveQueue(queue: string)
Returns a Promise resolving to: \`{ queue }\`

### DavidnetSDK.realtime.onMatched(callback)
Fires once your queue found a full group: \`{ queue, room, members }\`. You're already joined to
\`room\` at this point — start calling \`send(room, ...)\` / listening with \`onMessage\` right away.

### DavidnetSDK.realtime.onDisconnect(callback) / onReconnect(callback) / onError(callback)
The connection reconnects automatically in the background and silently rejoins your rooms.
\`onDisconnect\` fires when the connection drops, \`onReconnect\` fires after it's restored (with the
rooms that were rejoined, so you can resync game state), and \`onError\` fires for server-side
errors not tied to a specific call (e.g. rate-limited).

### Publishing from outside a player connection (e.g. a live data feed)
If you want to push data into a room from your own backend rather than from a connected player
(a stock ticker, a server-driven event, etc.), POST directly instead of using the SDK:
\`POST https://davidnet-backend.davidnet.net/social/community-games/<gameId>/realtime/<room>/publish\`
with an authenticated Davidnet session and JSON body \`{ "data": ... }\`. Everyone currently in that
room receives it via \`onMessage\` with \`from: null\`.

## Rules for your game code

- All functions return a Promise and REJECT on error or timeout (10s) — always wrap calls in
  try/catch so a network hiccup never crashes the game.
- Never rely on \`localStorage\`/\`sessionStorage\` for anything you want to persist — it is
  polyfilled with in-memory-only storage and is wiped on every reload.
- Call \`getJsonBlob()\` once on load to restore progress, and \`saveJsonBlob()\` whenever the
  player's state changes meaningfully (on level-complete, on checkpoint, etc) — not every frame.
- Do not implement your own leaderboard UI assumptions beyond what \`getHighscores()\` returns;
  the platform already renders a full leaderboard and highscore display around your game.
- For realtime games, treat the server as a dumb relay: it does not validate move legality, game
  rules, or physics. If your game needs to be cheat-resistant, have one client act as an
  authoritative host (e.g. whoever created the room) and treat other players' messages as input
  suggestions, not trusted state — same tradeoff as the anti-cheat model used for highscores.

## Example usage

\`\`\`javascript
// Call once when the game boots, to restore the player's progress.
async function restoreProgress() {
  try {
    const { data } = await window.DavidnetSDK.getJsonBlob();
    if (data) applySaveData(data);
  } catch (e) {
    console.warn("Could not load save", e);
  }
}

// Call whenever progress changes meaningfully.
async function onProgress(state) {
  try {
    await window.DavidnetSDK.saveJsonBlob(state);
  } catch (e) {
    console.warn("Could not save progress", e);
  }
}

// Call on game over / when the run ends.
async function onGameOver(finalScore) {
  try {
    const result = await window.DavidnetSDK.applyHighscore(finalScore);
    if (result.isNewGlobalBest) showMessage("New world record!");
    else if (result.isNewPersonalBest) showMessage("New personal best!");
  } catch (e) {
    console.warn("Could not submit score", e);
  }
}

// Realtime: queue two players into a 1v1 room, then exchange moves (works the same for
// any groupSize - use 50 for a shooter lobby, 2 for a board game, etc).
async function findOpponent() {
  window.DavidnetSDK.realtime.onMatched(async ({ room }) => {
    currentRoom = room;
    showMessage("Opponent found!");
  });
  await window.DavidnetSDK.realtime.joinQueue("ranked-1v1", 2);
}

window.DavidnetSDK.realtime.onMessage(({ room, data, from }) => {
  if (room !== currentRoom) return;
  applyOpponentMove(data, from);
});

function sendMove(move) {
  window.DavidnetSDK.realtime.send(currentRoom, { type: "move", move });
}
\`\`\`
`;

	$effect(() => {
		(async () => {
			await whenAuthReady();
			if (!authState.isLoggedIn && !authState.loading) {
				window.location.href = `${PUBLIC_ACCOUNT_FRONTEND_URL}/login?continue=${encodeURIComponent(page.url.href)}`;
			}
		})();
	});

	function requestUpload(event: SubmitEvent) {
		event.preventDefault();

		if (!files || files.length === 0) {
			errorMessage = "Please select a .zip file containing your game.";
			return;
		}

		errorMessage = "";
		showConfirmModal = true;
	}

	async function executeUpload() {
		showConfirmModal = false;
		isUploading = true;
		errorMessage = "";

		try {
			const formData = new FormData();
			formData.append("title", title);
			formData.append("description", description);
			formData.append("game", files![0]);
			if (iconFiles && iconFiles.length > 0) {
				formData.append("icon", iconFiles[0]);
			}
			formData.append("isAiGenerated", String(isAiGenerated));

			const result = await postFetch(
				`${PUBLIC_BACKEND_URL}/social/community-games/upload`,
				formData,
				undefined,
				true
			);

			if (result.success) {
				toast("Game Uploaded", "Your community game is now live!", "check_circle", 4000, "success");
				goto(`/games/community/player/${result.game.id}`);
			} else {
				errorMessage = result.message || result.code || "Failed to upload game.";
				toast("Upload Failed", errorMessage, "error", 4000, "danger");
			}
		} catch (err) {
			console.error("Upload error:", err);
			errorMessage = "A network error occurred during upload.";
		} finally {
			isUploading = false;
		}
	}

	function formatBytes(bytes: number, decimals = 2) {
		if (!+bytes) return "0 Bytes";
		const k = 1024;
		const dm = decimals < 0 ? 0 : decimals;
		const sizes = ["Bytes", "KiB", "MiB", "GiB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
	}
</script>

{#if showConfirmModal}
	<Modal title="Are you sure?" onclose={() => (showConfirmModal = false)}>
		<p>
			You are about to publish <strong>{title}</strong>
			. Currently, you cannot edit the game files after uploading. Ensure your
			<strong>index.html</strong>
			is at the root of the ZIP file.
		</p>

		{#snippet actions()}
			<Flex gap="small" justifyContent="end">
				<Button appearance="default" onclick={() => (showConfirmModal = false)}>Cancel</Button>
				<Button appearance="primary" onclick={executeUpload}>Yes, publish game</Button>
			</Flex>
		{/snippet}
	</Modal>
{/if}

<Flex direction="column" alignItems="center" marginTop="giant" marginBottom="giant" gap="large">
	<Form width="500px" onsubmit={requestUpload}>
		<Flex direction="column" gap="small" marginBottom="large">
			<h2>Upload Community Game</h2>
			<p style="color: {token.theme.color.text.secondary}">
				Share your HTML5 game. Must be a .zip containing an index.html file.
			</p>
		</Flex>

		<Field label="Game Title" name="title" required>
			{#snippet children()}
				<TextField
					bind:value={title}
					placeholder="Enter a cool title"
					maxlength={100}
					disabled={isUploading} />
			{/snippet}
		</Field>

		<Field label="Description (Optional)" name="description">
			{#snippet children()}
				<TextField
					bind:value={description}
					placeholder="How do you play?"
					maxlength={500}
					disabled={isUploading} />
			{/snippet}
		</Field>

		<Field label="Game Package (.zip)" name="game" required invalid={errorMessage}>
			{#snippet children()}
				<input
					type="file"
					accept=".zip,application/zip"
					bind:files
					required
					disabled={isUploading} />
			{/snippet}
		</Field>

		{#if files && files.length > 0}
			<Flex direction="column" gap="xsmall" marginTop="small" marginBottom="medium">
				<span style="font-weight: bold; font-size: 0.9rem;">Selected File:</span>
				{#each Array.from(files) as file}
					<Flex
						alignItems="center"
						gap="small"
						style="padding: 8px; background: {token.theme.color.surface
							.raised}; border-radius: 6px;">
						<Icon icon="folder_zip" />
						<span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
							{file.name}
						</span>
						<span style="color: {token.theme.color.text.tertiary}; font-size: 0.8rem;">
							{formatBytes(file.size)}
						</span>
					</Flex>
				{/each}
			</Flex>
		{/if}

		<Field label="Icon (Optional)" name="icon">
			{#snippet children()}
				<input
					type="file"
					accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
					bind:files={iconFiles}
					disabled={isUploading} />
			{/snippet}
		</Field>

		<p style="color: {token.theme.color.text.tertiary}; font-size: 0.85rem; margin-top: -8px;">
			Shown on the community games list. If you don't upload one, a default icon is used instead.
		</p>

		{#if iconFiles && iconFiles.length > 0}
			<Flex direction="column" gap="xsmall" marginTop="small" marginBottom="medium">
				<span style="font-weight: bold; font-size: 0.9rem;">Selected Icon:</span>
				{#each Array.from(iconFiles) as iconFile}
					<Flex
						alignItems="center"
						gap="small"
						style="padding: 8px; background: {token.theme.color.surface
							.raised}; border-radius: 6px;">
						<img
							src={URL.createObjectURL(iconFile)}
							alt=""
							style="width: 32px; height: 32px; object-fit: cover; border-radius: {token.global
								.radius.huge};" />
						<span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
							{iconFile.name}
						</span>
						<span style="color: {token.theme.color.text.tertiary}; font-size: 0.8rem;">
							{formatBytes(iconFile.size)}
						</span>
					</Flex>
				{/each}
			</Flex>
		{/if}

		<Field label="AI disclosure" name="isAiGenerated">
			{#snippet children()}
				<Flex alignItems="center" gap="small">
					<Checkbox bind:checked={isAiGenerated} disabled={isUploading} />
					<span>This game was created entirely by AI (not just AI-assisted)</span>
				</Flex>
			{/snippet}
		</Field>

		<p>
			Make sure you understand and accept the <Link
				opennewtab
				href="https://davidnet.net/legal/acceptable_use_policy">
				AUP
			</Link> and <Link opennewtab href="https://davidnet.net/legal/community_guidelines">
				Community guidelines
			</Link>!
		</p>

		<Flex justifyContent="end" marginTop="medium" gap="small">
			<Button
				iconbefore="arrow_back"
				onclick={() => {
					navigateBack();
				}}>
				Back
			</Button>
			<Button type="submit" loading={isUploading} disabled={isUploading}>Upload</Button>
		</Flex>
	</Form>

	<Flex direction="column" width="500px" gap="small">
		<Button
			appearance="subtle"
			iconbefore={showAiGuide ? "expand_less" : "smart_toy"}
			onclick={() => (showAiGuide = !showAiGuide)}>
			{showAiGuide ? "Hide SDK instructions" : "Building this with AI? Get SDK instructions"}
		</Button>

		{#if showAiGuide}
			<p style="color: {token.theme.color.text.secondary}">
				Paste the snippet below directly into your AI chat (ChatGPT, Claude, etc.) before asking it
				to build your game. It teaches the AI how to wire up working, persistent highscores and save
				data using the SDK that's automatically injected into every uploaded game — no backend work
				required on your end.
			</p>
			<CodeSnippet code={sdkGuideMarkdown} language="markdown" filename="davidnet-game-sdk.md" />
		{/if}
	</Flex>
</Flex>
