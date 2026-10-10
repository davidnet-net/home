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

## Rate limits

Every method below (except the \`realtime.*\` namespace, which has its own separate limit enforced
over the WebSocket - see its section) shares ONE budget per player per game: 60 calls per 10
seconds. That is generous for normal use - occasional score/save/achievement submissions, polling a
leaderboard every few seconds - but will start rejecting calls once something loops every frame.

- Every successful call below resolves with an extra \`rateLimit: { limit, remaining, resetAt }\`
  field tacked onto its normal result. Watch \`remaining\` and slow yourself down BEFORE you ever get
  rejected, instead of waiting to hit the wall.
- \`DavidnetSDK.getRateLimitStatus()\` returns that same \`{ limit, remaining, resetAt } | null\` shape
  synchronously, with no network call - \`null\` until your first SDK call has resolved at least once.
- If you do exceed it, the call's promise rejects like any other error - one more reason every call
  must be wrapped in try/catch (see Rules, below). \`resetAt\` is an epoch-ms timestamp for when the
  budget refills.

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
this \`id\`, the stored name/description/icon don't change. Repeat calls are cheap no-ops server-side,
but each one is still a network round trip that counts against your rate limit - call it ONCE when
the unlock condition first becomes true (e.g. on the "boss defeated" event, not every frame the boss
stays dead), not in a loop that re-checks the condition every frame.

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
- Never call an SDK method in a tight per-frame loop (score/save/achievement submissions, polling
  a leaderboard) — see Rate limits, above. Use game events (level-complete, boss-defeated,
  checkpoint) as your trigger, not the render loop.
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

// Self-throttle a leaderboard widget that polls getHighscores on a timer: check the rate limit
// BEFORE firing the next call instead of waiting to get rejected. getRateLimitStatus() is
// synchronous (no network call) and reflects the budget as of the last SDK call that resolved.
function canPollLeaderboard() {
  const status = window.DavidnetSDK.getRateLimitStatus();
  return !status || status.remaining > 5; // null (no calls yet) or plenty of budget left
}

// Optional: a second leaderboard, e.g. a per-level or per-mode one.
async function onTimeAttackFinish(seconds) {
  try {
    await window.DavidnetSDK.applyHighscore(seconds, { category: "time-attack" });
  } catch (e) {
    console.warn("Could not submit time-attack score", e);
  }
}

// Unlock an achievement - call this ONCE when the boss actually dies, not every frame
// while checking "is the boss dead".
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

## Using the SDK from Godot (HTML5/WebAssembly export), or any non-JS engine

\`window.DavidnetSDK\` is injected into the \`index.html\` file itself, at the HTML level - it works
identically no matter what produced that \`index.html\`. A Godot project exported to HTML5, a Unity
WebGL build, or a plain hand-written game all get the exact same \`window.DavidnetSDK\` object. The
only engine-specific part is bridging into it, since its functions are plain JS and return Promises,
which a non-JS language can't \`await\` directly.

For **Godot 4.x**, use the built-in \`JavaScriptBridge\` singleton (present only in the HTML5 export,
not the editor or other export targets): \`JavaScriptBridge.eval(code, true)\` to define a JS helper
once, \`JavaScriptBridge.create_callback(callable)\` to let JS call back into a GDScript \`Callable\`
(e.g. from a Promise's \`.then()\`/\`.catch()\`), and \`JavaScriptBridge.get_interface("window")\` to get
a GDScript-callable handle to \`window\`. The pattern below routes every call through one small JS
helper and passes everything as JSON strings both ways, so GDScript only ever deals with normal
\`Dictionary\`/\`Array\` values via its own \`JSON.parse_string()\`/\`JSON.stringify()\` - no manual
JS-object property walking needed. Drop this in as an autoload (or anywhere that runs once on boot):

\`\`\`gdscript
extends Node

func _ready() -> void:
	if not OS.has_feature("web"):
		return  # this bridge only exists in the HTML5 export, not when running in the editor

	JavaScriptBridge.eval("""
		window.__dnCall = function(method, argsJson, onResolve, onReject) {
			var args = JSON.parse(argsJson);
			var path = method.split(".");
			var target = window.DavidnetSDK;
			for (var i = 0; i < path.length - 1; i++) target = target[path[i]];
			var fn = target[path[path.length - 1]];
			Promise.resolve(fn.apply(target, args)).then(function(result) {
				onResolve(JSON.stringify(result === undefined ? null : result));
			}).catch(function(err) {
				onReject(String(err && err.message ? err.message : err));
			});
		};
	""", true)

# Call any window.DavidnetSDK method - dot-path for nested ones, e.g. "realtime.send" with
# args = [room, data]. on_success receives a parsed Dictionary/Array/primitive, on_error a String.
func call_sdk(method: String, args: Array, on_success: Callable, on_error: Callable) -> void:
	var resolve_cb := JavaScriptBridge.create_callback(func(cb_args):
		on_success.call(JSON.parse_string(cb_args[0]))
	)
	var reject_cb := JavaScriptBridge.create_callback(func(cb_args):
		on_error.call(cb_args[0])
	)
	var window_obj := JavaScriptBridge.get_interface("window")
	window_obj.__dnCall(method, JSON.stringify(args), resolve_cb, reject_cb)
\`\`\`

Usage from anywhere in the project once the above is autoloaded:

\`\`\`gdscript
func _on_game_over(final_score: int) -> void:
	call_sdk("applyHighscore", [final_score], _on_highscore_submitted, _on_sdk_error)

func _on_highscore_submitted(result: Dictionary) -> void:
	if result.get("isNewGlobalBest", false):
		show_message("New world record!")
	elif result.get("isNewPersonalBest", false):
		show_message("New personal best!")

func _on_sdk_error(message: String) -> void:
	print("DavidnetSDK call failed: ", message)
\`\`\`

By the time a game's own code starts running, \`window.DavidnetSDK\` is already defined - the
engine's own boot/loading sequence always takes longer than the SDK's setup, so there is no race
condition to guard against. On Godot 3.x the equivalent singleton is the older \`JavaScript\` (not
\`JavaScriptBridge\`) with a slightly different API (e.g. \`JSON.parse(text).result\` instead of
\`JSON.parse_string(text)\`) - the same JSON-bridge idea still works, but verify exact method names
against the 3.x docs, or upgrade to 4.x.
`;

	// A trimmed-down, copy-pasteable starting point shown on the "For humans" tab - unlike
	// sdkGuideMarkdown above (the full reference, meant to be handed to an AI assistant), this is
	// meant to be read and adapted by a person who is NOT using an AI assistant, so it only shows
	// the handful of calls almost every game needs, not the full API surface.
	const sdkStarterSnippet = `// Every one of these functions already exists on window.DavidnetSDK the moment your
// game loads - there is nothing to install or import, just call them directly.

// 1. Restore the player's progress once when the game boots.
async function restoreProgress() {
  try {
    const { data } = await window.DavidnetSDK.getJsonBlob();
    if (data) applySaveData(data); // data is null if this player never saved before
  } catch (e) {
    console.warn("Could not load save", e);
  }
}

// 2. Save progress whenever it changes meaningfully - on checkpoint/level-complete,
//    NOT every frame.
async function onCheckpoint(state) {
  try {
    await window.DavidnetSDK.saveJsonBlob(state);
  } catch (e) {
    console.warn("Could not save progress", e);
  }
}

// 3. Submit a score on game over. The server only ever keeps your best, so this is
//    always safe to call.
async function onGameOver(finalScore) {
  try {
    const { isNewPersonalBest, isNewGlobalBest } = await window.DavidnetSDK.applyHighscore(finalScore);
    if (isNewGlobalBest) showMessage("New world record!");
    else if (isNewPersonalBest) showMessage("New personal best!");
  } catch (e) {
    console.warn("Could not submit score", e);
  }
}

// 4. Unlock an achievement ONCE when something happens - not every frame.
async function onBossDefeated() {
  try {
    const { isNew } = await window.DavidnetSDK.unlockAchievement({
      id: "first_boss_kill",       // you choose this - keep it short and stable
      name: "Giant Slayer",        // shown to the player
      description: "Defeat the first boss",
      icon: "⚔️"
    });
    if (isNew) showMessage("Achievement unlocked: Giant Slayer!");
  } catch (e) {
    console.warn("Could not unlock achievement", e);
  }
}

// 5. Show the top 10 players, e.g. on a "leaderboard" button.
async function showLeaderboard() {
  const { leaderboard, playerHighscore } = await window.DavidnetSDK.getHighscores();
  renderLeaderboard(leaderboard); // [{ rank, username, displayName, avatarUrl, score }, ...]
}`;

	// A realtime starter: matchmake two players into a room, then exchange moves. The exact same
	// calls work for a 50-player action game by passing a bigger groupSize to joinQueue - the server
	// doesn't care how many players end up in a room.
	const sdkRealtimeStarterSnippet = `let currentRoom = null;

// 1. Put the player in a matchmaking queue. Once another player also calls this with
//    the same queue name, the server creates a room for both of them automatically.
async function findOpponent() {
  await window.DavidnetSDK.realtime.joinQueue("ranked-1v1", 2);
}

// 2. Fires once the queue found a full group - you're already joined to "room" at this point.
window.DavidnetSDK.realtime.onMatched(({ room }) => {
  currentRoom = room;
  showMessage("Opponent found!");
});

// 3. Fires for every message sent to any room you're in.
window.DavidnetSDK.realtime.onMessage(({ room, data, from }) => {
  if (room !== currentRoom) return;
  applyOpponentMove(data, from); // from = { userId, username, displayName, avatarUrl }
});

// 4. Send your move whenever the player makes one. Fire-and-forget - don't await every
//    single call in a hot loop, but it's cheap and safe to call often.
function sendMove(move) {
  window.DavidnetSDK.realtime.send(currentRoom, { type: "move", move });
}

// Shared room state (optional): great for player positions, ready-checks, a shared
// scoreboard - anything a player who joins LATE still needs to see.
async function joinArena(room) {
  const { state } = await window.DavidnetSDK.realtime.joinRoom(room);
  Object.entries(state).forEach(([key, value]) => applyPlayerState(key, value));

  // Live updates for everyone already in the room when someone calls setState.
  window.DavidnetSDK.realtime.onState(({ key, value }) => applyPlayerState(key, value));
}

function onMyPositionChanged(room, myUserId, position) {
  window.DavidnetSDK.realtime.setState(room, myUserId, position);
}`;

	// Godot (4.x) HTML5 export bridge. window.DavidnetSDK is plain JS and its methods return
	// Promises - GDScript can't await a Promise directly, so this routes every call through one
	// small JS helper (defined once via JavaScriptBridge.eval) and gets the result back as a JSON
	// string, which GDScript's own JSON.parse_string() turns into a normal Dictionary/Array. Shown
	// as "python" above the snippet for syntax coloring - the file itself is GDScript (.gd).
	const sdkGodotSnippet = `extends Node

# --- Davidnet SDK bridge for Godot HTML5 exports ---
# Call this once (e.g. from an autoload's _ready) before using call_sdk() anywhere else.
func _ready() -> void:
	if not OS.has_feature("web"):
		return  # this bridge only exists in the HTML5 export, not when running in the editor

	JavaScriptBridge.eval("""
		window.__dnCall = function(method, argsJson, onResolve, onReject) {
			var args = JSON.parse(argsJson);
			var path = method.split(".");
			var target = window.DavidnetSDK;
			for (var i = 0; i < path.length - 1; i++) target = target[path[i]];
			var fn = target[path[path.length - 1]];
			Promise.resolve(fn.apply(target, args)).then(function(result) {
				onResolve(JSON.stringify(result === undefined ? null : result));
			}).catch(function(err) {
				onReject(String(err && err.message ? err.message : err));
			});
		};
	""", true)


# Calls any window.DavidnetSDK method - use a dot-path for nested ones, e.g. "realtime.send".
# on_success receives a parsed Dictionary/Array/primitive, on_error receives an error String.
func call_sdk(method: String, args: Array, on_success: Callable, on_error: Callable) -> void:
	var resolve_cb := JavaScriptBridge.create_callback(func(cb_args):
		on_success.call(JSON.parse_string(cb_args[0]))
	)
	var reject_cb := JavaScriptBridge.create_callback(func(cb_args):
		on_error.call(cb_args[0])
	)
	var window_obj := JavaScriptBridge.get_interface("window")
	window_obj.__dnCall(method, JSON.stringify(args), resolve_cb, reject_cb)


# --- Usage ---

func _on_game_over(final_score: int) -> void:
	call_sdk("applyHighscore", [final_score], _on_highscore_submitted, _on_sdk_error)

func _on_highscore_submitted(result: Dictionary) -> void:
	if result.get("isNewGlobalBest", false):
		show_message("New world record!")
	elif result.get("isNewPersonalBest", false):
		show_message("New personal best!")

func _on_sdk_error(message: String) -> void:
	print("DavidnetSDK call failed: ", message)`;

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

					<h4 style="margin: 0;">Every function, at a glance</h4>
					<p style="color: {token.theme.color.text.secondary}">
						This is the entire API. Every one of these already exists on
						<code>window.DavidnetSDK</code>
						 — just call them from your game's own JavaScript, there is nothing to import or set up.
						Every function returns a Promise, so use
						<code>await</code>
						 (inside an
						<code>async function</code>
						) or
						<code>.then()</code>
						, and always wrap calls in try/catch — see "Common mistakes" below.
					</p>
					<ul style="margin: 0; padding-left: 20px; color: {token.theme.color.text.secondary}">
						<li>
							<code>DavidnetSDK.applyHighscore(score, options?)</code>
							 — submit a score. <code>options.category</code> picks a leaderboard other than the default
							one (optional). Resolves:
							<code>
								{'{'} score, playerHighscore, globalHighscore, isNewPersonalBest, isNewGlobalBest {'}'}
							</code>
						</li>
						<li>
							<code>DavidnetSDK.getHighscores(options?)</code>
							 — get the top 10 plus your own best. Resolves:
							<code>{'{'} playerHighscore, globalHighscore, leaderboard {'}'}</code>
							 — <code>leaderboard</code> is
							<code>[{'{'} rank, username, displayName, avatarUrl, score {'}'}, ...]</code>
							.
						</li>
						<li>
							<code>DavidnetSDK.saveJsonBlob(data, options?)</code>
							 — save anything JSON-serializable (≈1MB max). <code>options.slot</code> picks a save slot
							other than the default one (optional). Resolves: <code>{'{'} savedAt {'}'}</code>
						</li>
						<li>
							<code>DavidnetSDK.getJsonBlob(options?)</code>
							 — load what was last saved. Resolves: <code>{'{'} data, updatedAt {'}'}</code>
							 — <code>data</code> is <code>null</code> if nothing was saved yet.
						</li>
						<li>
							<code>DavidnetSDK.unlockAchievement({'{'} id, name, description?, icon?, progress?, target?
							{'}'})</code>
							 — unlock (or advance) an achievement. Resolves:
							<code>
								{'{'} isNew, achievement: {'{'} id, name, description, icon, progress, target, unlockedAt
								{'}'} {'}'}
							</code>
						</li>
						<li>
							<code>DavidnetSDK.getAchievements()</code>
							 — list this player's achievements for this game, unlocked and in-progress. Resolves:
							<code>
								{'{'} achievements: [{'{'} id, name, description, icon, progress, target, unlockedAt,
								unlockedPercentage {'}'}, ...] {'}'}
							</code>
						</li>
						<li>
							<code>DavidnetSDK.ugc.publishLevel({'{'} id?, title, data {'}'})</code>
							 — publish (or, with an existing <code>id</code>, overwrite) a level. Resolves:
							<code>{'{'} id, title, createdAt, updatedAt {'}'}</code>
						</li>
						<li>
							<code>DavidnetSDK.ugc.listLevels(options?)</code>
							 — list published levels (<code>options.mine</code>, <code>options.limit</code>,
							<code>options.offset</code>). Resolves:
							<code>
								{'{'} levels: [{'{'} id, title, creator, creatorDisplayName, createdAt, updatedAt {'}'},
								...], hasMore {'}'}
							</code>
						</li>
						<li>
							<code>DavidnetSDK.ugc.getLevel(id)</code>
							 — fetch one level's full data. Resolves:
							<code>{'{'} id, title, data, creator, creatorDisplayName, createdAt, updatedAt {'}'}</code>
						</li>
						<li>
							<code>DavidnetSDK.ugc.deleteLevel(id)</code>
							 — delete a level you published. Resolves: <code>{'{'} id {'}'}</code>
						</li>
						<li>
							<code>DavidnetSDK.getRateLimitStatus()</code>
							 — check your remaining request budget (see "Rate limits", below). Not a Promise — returns
							<code>{'{'} limit, remaining, resetAt {'}'} | null</code>
							 immediately.
						</li>
						<li>
							<code>DavidnetSDK.realtime.*</code>
							 — rooms, matchmaking and announcements for multiplayer games. Fully documented in its own
							section below, "Realtime multiplayer".
						</li>
					</ul>

					<h4 style="margin: 0;">Copy-paste starting point</h4>
					<p style="color: {token.theme.color.text.secondary}">
						The handful of calls almost every game ends up using, wired up end to end. Paste this into
						your game and adapt the
						<code>applySaveData</code>
						/
						<code>showMessage</code>
						/
						<code>renderLeaderboard</code>
						 calls to whatever your game actually does.
					</p>
					<CodeSnippet code={sdkStarterSnippet} language="javascript" filename="davidnet-sdk-starter.js" />

					<h4 style="margin: 0;">Realtime multiplayer: DavidnetSDK.realtime</h4>
					<p style="color: {token.theme.color.text.secondary}">
						A generic, content-agnostic realtime layer: named rooms (with presence and a shared state
						channel), a matchmaking queue, and a lobby-wide announcement channel. The platform never
						looks at what you send, so the exact same functions work for a 2-player turn-based game, a
						50+ player action game, or a one-way live feed with no "players" concept at all — just pass
						a bigger <code>groupSize</code> to <code>joinQueue</code>, there's no maximum room/queue size.
					</p>
					<p style="color: {token.theme.color.text.secondary}">
						Every method below auto-connects on first use — you never need to call
						<code>connect()</code>
						 yourself unless you specifically want to open the connection early (e.g. on a lobby screen
						before matchmaking starts).
					</p>
					<ul style="margin: 0; padding-left: 20px; color: {token.theme.color.text.secondary}">
						<li>
							<code>DavidnetSDK.realtime.connect()</code>
							 — opens the connection early. Resolves: <code>{'{'}{'}'}</code>
						</li>
						<li>
							<code>DavidnetSDK.realtime.joinRoom(room)</code>
							 — joins a named room (created on first join, destroyed when empty; join as many as you
							like). Resolves: <code>{'{'} room, members, state {'}'}</code>
							 — <code>members</code> is everyone already there
							(<code>{'{'} userId, username, displayName, avatarUrl {'}'}</code>
							each), <code>state</code> is every key/value anyone has set via <code>setState</code> so
							far.
						</li>
						<li>
							<code>DavidnetSDK.realtime.leaveRoom(room)</code>
							 — Resolves: <code>{'{'} room {'}'}</code>
						</li>
						<li>
							<code>DavidnetSDK.realtime.getRoomInfo(room)</code>
							 — check member count/list WITHOUT joining (e.g. "3/8 players" on a lobby list before
							committing). Resolves: <code>{'{'} room, memberCount, members {'}'}</code>
						</li>
						<li>
							<code>DavidnetSDK.realtime.send(room, data, options?)</code>
							 — broadcasts JSON-serializable <code>data</code> to everyone else currently in
							<code>room</code>
							 (max ~64kb). Pass <code>{'{'} echo: true {'}'}</code>
							 to also get it back yourself via <code>onMessage</code>. Fire-and-forget — resolves once
							sent, doesn't wait for delivery, safe to call often. Resolves: <code>{'{'}{'}'}</code>
						</li>
						<li>
							<code>DavidnetSDK.realtime.setState(room, key, value)</code>
							 — sets a named key's value for everyone in the room. The server remembers the LATEST
							value per key and hands the full set to late joiners via <code>joinRoom</code>'s
							<code>state</code>
							, plus live-pushes it to everyone else already there via <code>onState</code>. Must be
							joined to the room first. Resolves: <code>{'{'} room, key {'}'}</code>
						</li>
						<li>
							<code>DavidnetSDK.realtime.joinQueue(queue, groupSize, metadata?)</code>
							 — matchmaking: join a named queue. Everyone joining the same <code>queue</code> name
							should agree on the same <code>groupSize</code>; once that many are waiting, the server
							pops them off FIFO and auto-creates a room — listen with <code>onMatched</code>.
							<code>metadata</code> (e.g. a skill rating) is yours to use for your own matching logic on
							top of this — the server itself just does plain FIFO grouping. Resolves:
							<code>{'{'} queue, position {'}'}</code>
						</li>
						<li>
							<code>DavidnetSDK.realtime.leaveQueue(queue)</code>
							 — Resolves: <code>{'{'} queue {'}'}</code>
						</li>
						<li>
							<code>DavidnetSDK.realtime.getQueueInfo(queue)</code>
							 — check how many are waiting WITHOUT joining (e.g. "waiting for 2 more players").
							Resolves: <code>{'{'} queue, waiting {'}'}</code>
						</li>
						<li>
							<code>DavidnetSDK.realtime.announce(data, options?)</code>
							 — broadcasts to EVERY player currently connected to this game's lobby, not just one
							room (e.g. "Player X just beat the boss!"). Pass <code>{'{'} echo: true {'}'}</code>
							 to also get your own announcement back. Fire-and-forget. Resolves:
							<code>{'{'}{'}'}</code>
						</li>
						<li>
							<code>DavidnetSDK.realtime.onMessage(callback)</code>
							 — fires for every message sent to any room you're in:
							<code>{'{'} room, data, from, ts {'}'}</code>
							. Returns an unsubscribe function.
						</li>
						<li>
							<code>DavidnetSDK.realtime.onPresence(callback)</code>
							 — fires when someone joins/leaves a room you're in:
							<code>{'{'} room, event: "join" | "leave", member {'}'}</code>
							.
						</li>
						<li>
							<code>DavidnetSDK.realtime.onState(callback)</code>
							 — fires when anyone (including you) calls <code>setState</code> in a room you're in:
							<code>{'{'} room, key, value, from {'}'}</code>
							.
						</li>
						<li>
							<code>DavidnetSDK.realtime.onMatched(callback)</code>
							 — fires once your queue found a full group:
							<code>{'{'} queue, room, members {'}'}</code>
							. You're already joined to <code>room</code> at this point.
						</li>
						<li>
							<code>DavidnetSDK.realtime.onAnnouncement(callback)</code>
							 — fires for every lobby-wide announcement from any connected player:
							<code>{'{'} data, from, ts {'}'}</code>
							.
						</li>
						<li>
							<code>DavidnetSDK.realtime.onDisconnect(callback)</code>
							 /
							<code>onReconnect(callback)</code>
							 /
							<code>onError(callback)</code>
							 — the connection reconnects automatically in the background and silently rejoins your
							rooms. <code>onDisconnect</code> fires when it drops, <code>onReconnect</code> fires once
							restored (with the rooms that were rejoined, so you can resync state), and
							<code>onError</code>
							 fires for server-side errors not tied to one call (e.g. you're sending too fast).
						</li>
					</ul>
					<p style="color: {token.theme.color.text.secondary}">
						<strong>Realtime has its own separate rate limit</strong>
						 — 200 messages per second per connection, enforced over the WebSocket itself (unrelated to
						the per-player-per-game budget in "Rate limits" above, which only covers
						highscores/saves/achievements/levels — <code>getRateLimitStatus()</code> does NOT reflect
						this). 200/s is far more than any browser game needs for input sync — most games are fine
						sending whenever game state actually changes (e.g. 10-30 times a second), not on every
						animation frame.
					</p>
					<p style="color: {token.theme.color.text.secondary}">
						<strong>The server does not validate anything you send</strong>
						 — it is a dumb relay, not an authority on move legality, game rules, or physics. If your
						game needs to be cheat-resistant, have one client (e.g. whoever created the room) act as an
						authoritative host and treat other players' messages as input suggestions, not trusted
						state — the same tradeoff the highscore anti-cheat model makes.
					</p>
					<CodeSnippet
						code={sdkRealtimeStarterSnippet}
						language="javascript"
						filename="davidnet-sdk-realtime-starter.js" />

					<h4 style="margin: 0;">Not writing plain JavaScript? (Godot, Unity, etc.)</h4>
					<p style="color: {token.theme.color.text.secondary}">
						Everything above works no matter what built your game — <code>window.DavidnetSDK</code> is
						injected into the <code>index.html</code> file itself, at the HTML level, not tied to any
						particular engine or language. A Godot project exported to HTML5/WebAssembly, a Unity WebGL
						build, or anything else that ends up as an <code>index.html</code> + JS/WASM bundle gets the
						exact same <code>window.DavidnetSDK</code> object. By the time your game's own code starts
						running, the SDK is already defined — the engine's own boot/loading sequence always takes
						longer than that.
					</p>
					<p style="color: {token.theme.color.text.secondary}">
						The only catch: <code>window.DavidnetSDK</code>'s functions are plain JavaScript and return
						JS Promises, so a non-JS language needs its own engine-specific bridge to call them and get
						the result back. For <strong>Godot 4.x</strong>, that bridge is the built-in
						<code>JavaScriptBridge</code>
						 singleton (only present in the HTML5 export, not in the editor or other export targets):
					</p>
					<ul style="margin: 0; padding-left: 20px; color: {token.theme.color.text.secondary}">
						<li>
							<code>JavaScriptBridge.eval(code, true)</code>
							 runs a string of JS once — used below to define one small reusable helper function on
							the JS side.
						</li>
						<li>
							<code>JavaScriptBridge.create_callback(callable)</code>
							 wraps a GDScript <code>Callable</code> so JavaScript can call it (e.g. from a Promise's
							<code>.then()</code>
							/
							<code>.catch()</code>
							).
						</li>
						<li>
							<code>JavaScriptBridge.get_interface("window")</code>
							 gets a GDScript-callable handle to the page's <code>window</code> object.
						</li>
					</ul>
					<p style="color: {token.theme.color.text.secondary}">
						Rather than wrestling with JS objects from GDScript directly, the helper below passes
						everything as JSON strings both ways — arguments out, results back in — so GDScript only
						ever deals with normal <code>Dictionary</code>
						/
						<code>Array</code>
						 values via its own built-in <code>JSON.parse_string()</code>/<code>JSON.stringify()</code>.
						Drop this in as an autoload (or anywhere that runs once on boot), then call
						<code>call_sdk(method, args, on_success, on_error)</code>
						 from anywhere in your project — the method name can be a dot-path for nested ones, e.g.
						<code>"realtime.send"</code>
						with <code>args = [room, data]</code>.
					</p>
					<CodeSnippet code={sdkGodotSnippet} language="python" filename="davidnet_sdk_bridge.gd" />
					<p style="color: {token.theme.color.text.secondary}">
						On Godot 3.x, the equivalent singleton is the older <code>JavaScript</code> (not
						<code>JavaScriptBridge</code>) with a slightly different API (e.g.
						<code>JSON.parse(text).result</code>
						 instead of <code>JSON.parse_string(text)</code>) — the same JSON-bridge idea still works,
						but double-check the exact method names against the 3.x docs, or upgrade to 4.x.
					</p>

					<h4 style="margin: 0;">Rate limits</h4>
					<p style="color: {token.theme.color.text.secondary}">
						Every function above (except <code>realtime.*</code>, which has its own separate limit)
						shares one budget per player per game: 60 calls every 10 seconds. That comfortably covers
						normal use — score/save/achievement calls on game events, polling a leaderboard every few
						seconds — but will start rejecting calls once something loops every animation frame. Two
						ways to stay under it:
					</p>
					<ul style="margin: 0; padding-left: 20px; color: {token.theme.color.text.secondary}">
						<li>
							Trigger calls from game <strong>events</strong> (level-complete, boss-defeated, checkpoint),
							never from the render loop itself.
						</li>
						<li>
							Every successful call's result also carries
							<code>rateLimit: {'{'} limit, remaining, resetAt {'}'}</code>
							, and
							<code>DavidnetSDK.getRateLimitStatus()</code>
							 returns that same shape instantly (no network call, <code>null</code> until your first SDK
							call resolves) — check <code>remaining</code> if you're doing something call-heavy, like a
							live leaderboard widget on a timer.
						</li>
					</ul>

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

					<h4 style="margin: 0;">Common mistakes</h4>
					<ul style="margin: 0; padding-left: 20px; color: {token.theme.color.text.secondary}">
						<li>
							<strong>Forgetting try/catch.</strong>
							Every SDK call rejects on a network hiccup, a timeout (10s), or a rate limit — an
							unhandled rejection will usually just silently stop your game's logic at that point.
						</li>
						<li>
							<strong>Calling a score/save/achievement function every frame.</strong>
							Trigger from game events (game-over, checkpoint, boss-defeated), not the render loop — see
							"Rate limits", above.
						</li>
						<li>
							<strong>Trying to <code>fetch()</code> your own API, or reading/writing
							<code>localStorage</code>.</strong>
							Neither works in here — use <code>saveJsonBlob</code>/<code>getJsonBlob</code> for
							anything that needs to persist.
						</li>
						<li>
							<strong><code>index.html</code> not at the root of the .zip.</strong>
							A zip containing a single top-level folder (e.g. from "Compress" on macOS, or a build tool
							that wraps output in <code>dist/</code>) will fail to upload — re-zip so
							<code>index.html</code>
							 is directly at the top level, not nested one level in.
						</li>
					</ul>
				</Flex>
			{:else}
				<CodeSnippet code={sdkGuideMarkdown} language="markdown" filename="davidnet-game-sdk.md" />
			{/if}
		{/if}
	</Flex>
</Flex>
