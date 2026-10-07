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
	let showGuide = $state(false);
	let guideMode = $state<"human" | "ai">("human");

	const sdkGuideMarkdown = `# Davidnet Community Games — Platform SDK

Your game runs inside a sandboxed \`<iframe>\` with its own opaque origin: no cookies, and no real
\`localStorage\`/\`sessionStorage\` (both exist but are polyfilled to no-ops, so anything written to
them vanishes on reload). Network access is NOT fully blocked — it's asymmetric, enforced by the
iframe's Content-Security-Policy:

- Loading external resources — \`<script src>\`, \`<link rel="stylesheet">\`, \`<img>\`,
  \`<audio>\`/\`<video>\`, \`@font-face\`, etc. — from ANY host is allowed. Pulling a game engine,
  library, font or asset from a CDN (cdnjs, jsdelivr, unpkg, Google Fonts, …) is fine and common.
- Your code CANNOT make its own outbound \`fetch()\`/\`XMLHttpRequest\`/\`WebSocket\`/\`EventSource\`
  calls to third-party domains — \`connect-src\` is locked to the same origin that served your game
  files. This is a deliberate anti-exfiltration boundary, not a bug: don't design the game around
  calling some other API (or even Davidnet's own API directly) — it will be blocked.
- Nesting another \`<iframe>\` inside your game is blocked outright (\`frame-src 'none'\`).
- All communication with Davidnet itself — highscores, save data, realtime multiplayer — happens
  exclusively through \`window.DavidnetSDK\`, which is automatically injected into every uploaded
  \`index.html\`. Under the hood it talks to the parent page via \`postMessage\`, which is NOT subject
  to \`connect-src\` (it isn't a network request from the browser's point of view). You do NOT need
  to write any postMessage or networking code yourself; just call these functions from your game
  code.

## API

### DavidnetSDK.applyHighscore(score: number, options?: { category?: string })
Returns a Promise resolving to:
\`{ score, category, playerHighscore, globalHighscore, isNewPersonalBest, isNewGlobalBest }\`
Submits a score. The server only ever keeps the HIGHEST score per player and globally, so it is
safe to call this every time the player's score might be a new best (e.g. on game over). Score
must be a non-negative integer.

A game can have MULTIPLE leaderboards: pass \`{ category: "time-attack" }\` (letters, numbers,
\`-\`/\`_\`, up to 50 chars) to submit to a leaderboard other than the default one. Omit it entirely
and you get the classic one-leaderboard-per-game behavior — this is fully backwards compatible,
every game that was uploaded before categories existed keeps working unchanged.

### DavidnetSDK.getHighscores(options?: { category?: string })
Returns a Promise resolving to:
\`{ category, playerHighscore, globalHighscore, leaderboard }\`
\`leaderboard\` is the top 10: \`[{ rank, userId, username, displayName, avatarUrl, score }]\`.
\`globalHighscore\` is that same shape for the #1 entry (or null if nobody has scored yet). Pass
\`{ category: "time-attack" }\` to read a non-default leaderboard — same rule as \`applyHighscore\`.

### DavidnetSDK.saveJsonBlob(data, options?: { slot?: string })
Returns a Promise resolving to: \`{ savedAt }\`
Persists any JSON-serializable value (object, array, etc.) as the player's save file — inventory,
level progress, settings, anything. Max size is about 1MB. Overwrites any previous save in that slot
for this player on this game.

A game can keep MULTIPLE saves: pass \`{ slot: "hardcore" }\` (letters, numbers, \`-\`/\`_\`, up to 50
chars) to use a slot other than the default one. Omit it entirely and you get the classic
one-save-per-player behavior — fully backwards compatible, every game uploaded before slots existed
keeps working unchanged.

### DavidnetSDK.getJsonBlob(options?: { slot?: string })
Returns a Promise resolving to: \`{ data, updatedAt }\`
Returns the player's previously saved value for that slot, or \`data: null\` if nothing was saved
there yet. Pass \`{ slot: "hardcore" }\` to read a non-default slot — same rule as \`saveJsonBlob\`.

## Achievements

### DavidnetSDK.unlockAchievement({ id, name, description?, icon?, progress?, target? })
Returns a Promise resolving to:
\`{ isNew, achievement: { id, name, description, icon, progress, target, unlockedAt } }\`
Unlocks (or advances) an achievement for the current player. \`id\` is a stable string YOU choose
(letters, numbers, \`-\`/\`_\`, up to 100 chars) — unique within your game, not globally, so keep it
short and stable (e.g. \`"first_win"\`, not something you'll rename later). \`name\` is what's shown
to the player; \`description\` and \`icon\` (an emoji works well) are optional.

**Without \`progress\`/\`target\`:** classic instant unlock. First call wins: if the player already has
this \`id\`, the stored name/description/icon don't change. Safe to call every time the unlock
condition is true (e.g. every frame a boss is defeated) — repeat calls are cheap no-ops.

**With \`progress\` + \`target\`** (both positive integers): tracks a progress bar instead of unlocking
instantly — call this every time progress changes (e.g. \`{ progress: 12, target: 50 }\` for "12 of 50
enemies defeated"). The server remembers the HIGHEST progress seen; \`isNew\` only flips \`true\` the
moment progress reaches target (the achievement completes), after which it's immutable, same as a
classic achievement. \`getAchievements()\` includes in-progress achievements too (\`unlockedAt: null\`)
so you can rebuild a progress bar on load without tracking it yourself.

### DavidnetSDK.getAchievements()
Returns a Promise resolving to:
\`{ achievements: [{ id, name, description, icon, progress, target, unlockedAt, unlockedPercentage }] }\`
Every achievement the current player has unlocked OR made progress on in THIS game. \`unlockedAt\` is
\`null\` for an in-progress (not yet completed) achievement. \`unlockedPercentage\` (0-100) is the
share of players who have fully unlocked that achievement id — handy for a rarity badge like "3% of
players have this".

## Community/UGC levels: DavidnetSDK.ugc

A generic level-upload system. Level data is an opaque JSON blob — the platform never looks inside
it, so it works for any level/map/track format your game defines. Levels are public once published:
any player can list and download them, same trust model as the rest of this sandboxed game (your
game decides what to publish and how to interpret what it downloads).

### DavidnetSDK.ugc.publishLevel({ id?, title, data })
Returns a Promise resolving to: \`{ id, title, createdAt, updatedAt }\`
Publishes a new level, or — if you pass the \`id\` of a level you own — overwrites it in place (e.g.
after the player edits it further). \`title\` is required (up to 100 chars); \`data\` is your opaque
level payload.

### DavidnetSDK.ugc.listLevels(options?: { mine?: boolean, limit?: number, offset?: number })
Returns a Promise resolving to:
\`{ levels: [{ id, title, creator, creatorDisplayName, createdAt, updatedAt }], hasMore }\`
Lists published levels for this game, newest first. Pass \`{ mine: true }\` to list only your own,
\`{ limit, offset }\` to page through them (\`limit\` defaults to 20, max 50). Does NOT include the
level data itself — call \`getLevel\` once the player picks one.

### DavidnetSDK.ugc.getLevel(id: string)
Returns a Promise resolving to:
\`{ id, title, data, creator, creatorDisplayName, createdAt, updatedAt }\`

### DavidnetSDK.ugc.deleteLevel(id: string)
Returns a Promise resolving to: \`{ id }\`
Deletes a level you published (or any level, if you're the game's creator).

## Realtime multiplayer: DavidnetSDK.realtime

A generic, content-agnostic real-time layer: named rooms (pub/sub channels with presence and a
per-room state channel), a matchmaking queue, and a lobby-wide announcement channel. The platform
never looks at what you send, so the exact same API works for a 2-player turn-based game, a 50+
player action game, or a one-way live feed (e.g. a price ticker) with no "players" at all. There is
no maximum room size, queue size, or group size.

All methods auto-connect on first use — you don't need to call \`connect()\` yourself unless you
want to open the connection early.

### DavidnetSDK.realtime.joinRoom(room: string)
Returns a Promise resolving to: \`{ room, members, state }\` — \`members\` is everyone already in the
room (each \`{ userId, username, displayName, avatarUrl }\`), \`state\` is a snapshot of every
key/value set in this room so far via \`setState\` (see below). Rooms are created on first join and
destroyed when empty — just pick a name. Join as many rooms as you like.

### DavidnetSDK.realtime.leaveRoom(room: string)
Returns a Promise resolving to: \`{ room }\`

### DavidnetSDK.realtime.getRoomInfo(room: string)
Returns a Promise resolving to: \`{ room, memberCount, members }\`
Checks how many members are currently in a room WITHOUT joining it — e.g. to show "3/8 players" on
a lobby list before committing to join.

### DavidnetSDK.realtime.send(room: string, data, options?: { echo?: boolean })
Broadcasts any JSON-serializable \`data\` to everyone else currently in \`room\` (max ~64kb). Pass
\`{ echo: true }\` to also receive your own message back via \`onMessage\`. This is fire-and-forget —
it resolves once sent, it does not wait for delivery, so call it as often as your game needs
(every input tick is fine).

### DavidnetSDK.realtime.setState(room: string, key: string, value)
Returns a Promise resolving to: \`{ room, key }\`
Sets a named key's value for everyone in the room: the server remembers the LATEST value per key and
hands the full set back as \`state\` to anyone who joins afterwards (see \`joinRoom\`), plus pushes a
live \`state\` event to everyone else already in the room. Useful for anything a late joiner needs to
catch up on — player positions, ready/not-ready status, a shared scoreboard — in any realtime game,
not just shooters. You must be joined to the room first.

### DavidnetSDK.realtime.onMessage(callback)
Fires for every message sent to any room you're in: \`{ room, data, from, ts }\`. \`from\` is the
sender's member info. Returns an unsubscribe function.

### DavidnetSDK.realtime.onPresence(callback)
Fires when someone joins or leaves a room you're in: \`{ room, event: "join" | "leave", member }\`.

### DavidnetSDK.realtime.onState(callback)
Fires when anyone (including you) calls \`setState\` in a room you're in:
\`{ room, key, value, from }\`.

### DavidnetSDK.realtime.joinQueue(queue: string, groupSize: number, metadata?)
A matchmaking primitive. Returns a Promise resolving to: \`{ queue, position }\`. Everyone who calls
\`joinQueue\` with the same \`queue\` name should pass the same \`groupSize\`. As soon as \`groupSize\`
callers are waiting, the server pops them off in join order and auto-creates a room for them —
listen for it with \`onMatched\`. Use \`metadata\` (e.g. skill rating) if you want to build your own
smarter matching on top of this — the server itself does plain FIFO grouping.

### DavidnetSDK.realtime.leaveQueue(queue: string)
Returns a Promise resolving to: \`{ queue }\`

### DavidnetSDK.realtime.getQueueInfo(queue: string)
Returns a Promise resolving to: \`{ queue, waiting }\`
Checks how many players are currently waiting in a queue WITHOUT joining it — e.g. to show "waiting
for 2 more players" up front.

### DavidnetSDK.realtime.onMatched(callback)
Fires once your queue found a full group: \`{ queue, room, members }\`. You're already joined to
\`room\` at this point — start calling \`send(room, ...)\` / listening with \`onMessage\` right away.

### DavidnetSDK.realtime.announce(data, options?: { echo?: boolean })
Returns a Promise resolving to: \`{}\`
Broadcasts to EVERY player currently connected to this game's lobby, not just a specific room — for
server-wide-feeling announcements (e.g. "Player X just beat the boss!") independent of whatever room
each player is in. Pass \`{ echo: true }\` to also receive your own announcement back. Fire-and-forget
— does not wait for delivery.

### DavidnetSDK.realtime.onAnnouncement(callback)
Fires for every lobby-wide announcement from any connected player of this game: \`{ data, from, ts }\`.

### DavidnetSDK.realtime.onDisconnect(callback) / onReconnect(callback) / onError(callback)
The connection reconnects automatically in the background and silently rejoins your rooms.
\`onDisconnect\` fires when the connection drops, \`onReconnect\` fires after it's restored (with the
rooms that were rejoined, so you can resync game state), and \`onError\` fires for server-side
errors not tied to a specific call (e.g. rate-limited).

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

// Optional: a second leaderboard, e.g. a per-level or per-mode one.
async function onTimeAttackFinish(seconds) {
  try {
    await window.DavidnetSDK.applyHighscore(seconds, { category: "time-attack" });
  } catch (e) {
    console.warn("Could not submit time-attack score", e);
  }
}

// Unlock an achievement - safe to call every time the condition is met.
async function onBossDefeated() {
  try {
    const { isNew } = await window.DavidnetSDK.unlockAchievement({
      id: "first_boss_kill",
      name: "Giant Slayer",
      description: "Defeat the first boss",
      icon: "⚔️"
    });
    if (isNew) showMessage("Achievement unlocked: Giant Slayer!");
  } catch (e) {
    console.warn("Could not unlock achievement", e);
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

// Progress achievement: call with the current/target progress whenever it changes.
// "isNew" only flips true the moment it actually completes.
async function onEnemyDefeated(totalDefeated) {
  try {
    const { isNew } = await window.DavidnetSDK.unlockAchievement({
      id: "monster_hunter",
      name: "Monster Hunter",
      description: "Defeat 50 enemies",
      icon: "🗡️",
      progress: totalDefeated,
      target: 50
    });
    if (isNew) showMessage("Achievement unlocked: Monster Hunter!");
  } catch (e) {
    console.warn("Could not update achievement progress", e);
  }
}

// Shared room state: late joiners get the current snapshot for free via joinRoom's "state",
// and everyone already in the room gets a live update via onState.
async function joinArena(room) {
  const { state } = await window.DavidnetSDK.realtime.joinRoom(room);
  Object.entries(state).forEach(([key, value]) => applyPlayerState(key, value));

  window.DavidnetSDK.realtime.onState(({ key, value }) => applyPlayerState(key, value));
}

function onMyPositionChanged(room, myUserId, position) {
  window.DavidnetSDK.realtime.setState(room, myUserId, position);
}

// Community levels: publish one the player built, then let others browse and play them.
async function publishMyLevel(levelData) {
  try {
    const { id } = await window.DavidnetSDK.ugc.publishLevel({
      title: "Lava Castle",
      data: levelData
    });
    showMessage("Level published!");
    return id;
  } catch (e) {
    console.warn("Could not publish level", e);
  }
}

async function browseLevels() {
  const { levels } = await window.DavidnetSDK.ugc.listLevels({ limit: 20 });
  renderLevelBrowser(levels); // each entry has { id, title, creator, ... } - no "data" yet
}

async function playLevel(levelId) {
  const { data } = await window.DavidnetSDK.ugc.getLevel(levelId);
  loadLevel(data);
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
			. You'll be able to update the title, description, icon, AI disclosure and game files at any time
			after uploading. Ensure your
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

	<Flex direction="column" width="500px" gap="small" height="auto">
		<Button
			appearance="subtle"
			iconbefore={showGuide ? "expand_less" : "smart_toy"}
			onclick={() => (showGuide = !showGuide)}>
			{showGuide
				? "Hide SDK instructions"
				: "Adding highscores, saves or multiplayer? Read the SDK guide"}
		</Button>

		{#if showGuide}
			<Flex gap="small" height="auto">
				<Button
					appearance="subtle"
					selected={guideMode === "human"}
					onclick={() => (guideMode = "human")}>
					For humans
				</Button>
				<Button
					appearance="subtle"
					selected={guideMode === "ai"}
					onclick={() => (guideMode = "ai")}>
					For AI assistants
				</Button>
			</Flex>

			{#if guideMode === "human"}
				<Flex direction="column" gap="small" height="auto">
					<p style="color: {token.theme.color.text.secondary}">
						A plain-language explanation — read this if you're writing the game yourself. If you're
						having an AI build it for you, switch to the "For AI assistants" tab instead and hand it
						that snippet directly.
					</p>

					<h4 style="margin: 0;">
						What <code>window.DavidnetSDK</code>
						 gives you
					</h4>
					<ul style="margin: 0; padding-left: 20px; color: {token.theme.color.text.secondary}">
						<li>
							<strong>Highscores &amp; leaderboards</strong>
							 — submit a score, see the player's personal best, and see the top 10 globally. The server
							always keeps only the best score per player, so it's safe to submit on every game over.
							You can have more than one leaderboard per game (e.g. one per level or mode) by giving each
							a category name.
						</li>
						<li>
							<strong>Achievements</strong>
							 — unlock a named achievement for a player (you pick the id, name, description and icon),
							or track one as a progress bar by also passing a current/target value. Shows up on the player's
							own cross-game achievements page, and comes back with a rarity percentage ("3% of players
							have this").
						</li>
						<li>
							<strong>Save data</strong>
							 — store a JSON blob per player (inventory, level progress, settings, ...) and load it back
							next time they play. About 1MB max. You can keep more than one save by giving each a named
							slot (e.g. a separate hardcore-mode save).
						</li>
						<li>
							<strong>Community levels</strong>
							 — let players publish and browse each other's levels/maps as an opaque JSON blob you define
							the format of. The platform just stores and lists them; your game decides what's inside.
						</li>
						<li>
							<strong>Realtime multiplayer</strong>
							 — named rooms with a shared state channel (so a late joiner catches up instantly), a matchmaking
							queue, and a lobby-wide announcement channel for messages that aren't tied to one specific
							room. Works for 2 players or 50+.
						</li>
					</ul>
					<p style="color: {token.theme.color.text.secondary}">
						All of this is available the moment your game loads, as the
						<code>window.DavidnetSDK</code>
						 object — nothing to install, no backend or database of your own to run.
					</p>

					<h4 style="margin: 0;">What the sandbox actually blocks</h4>
					<p style="color: {token.theme.color.text.secondary}">
						Your game runs inside a locked-down frame, but that does <strong>not</strong>
						mean "no internet access" — it's more specific than that:
					</p>
					<ul style="margin: 0; padding-left: 20px; color: {token.theme.color.text.secondary}">
						<li>
							<strong>Loading things is fine.</strong>
							 Pulling in a game engine, library, font, image, or sound/video from an external CDN (cdnjs,
							jsdelivr, unpkg, Google Fonts, ...) works exactly like it would on any normal webpage.
						</li>
						<li>
							<strong>Your game's own code calling out is blocked.</strong>
							It cannot make its own requests to other websites or APIs (no
							<code>fetch</code>
							, no raw
							<code>WebSocket</code>
							 to a random server) — that's blocked on purpose, mainly so a game can't quietly send players'
							data somewhere else.
						</li>
						<li>
							<strong>No real cookies or browser storage.</strong>
							Anything that needs to survive a reload must go through the SDK's save data functions,
							not
							<code>localStorage</code>
							.
						</li>
						<li>
							<strong>Talking to Davidnet itself</strong>
							(scores, saves, multiplayer) always goes through
							<code>window.DavidnetSDK</code>
							, never a direct network call — that's how it gets through even though direct outbound
							requests are blocked.
						</li>
					</ul>
				</Flex>
			{:else}
				<CodeSnippet code={sdkGuideMarkdown} language="markdown" filename="davidnet-game-sdk.md" />
			{/if}
		{/if}
	</Flex>
</Flex>
