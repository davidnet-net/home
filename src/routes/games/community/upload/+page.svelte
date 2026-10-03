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
		whenAuthReady	} from "@davidnet-net/svelte-ui";
	import { token } from "@davidnet-net/svelte-ui/tokens";

	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { PUBLIC_BACKEND_URL } from "$env/static/public";

	let title = $state("");
	let description = $state("");
	let files = $state<FileList | null>(null);
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

## Rules for your game code

- All 4 functions return a Promise and REJECT on error or timeout (10s) — always wrap calls in
  try/catch so a network hiccup never crashes the game.
- Never rely on \`localStorage\`/\`sessionStorage\` for anything you want to persist — it is
  polyfilled with in-memory-only storage and is wiped on every reload.
- Call \`getJsonBlob()\` once on load to restore progress, and \`saveJsonBlob()\` whenever the
  player's state changes meaningfully (on level-complete, on checkpoint, etc) — not every frame.
- Do not implement your own leaderboard UI assumptions beyond what \`getHighscores()\` returns;
  the platform already renders a full leaderboard and highscore display around your game.

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
\`\`\`
`;

	$effect(() => {
		(async () => {
			await whenAuthReady();
			if (!authState.isLoggedIn && !authState.loading) {
				goto(`/login?continue=${encodeURIComponent(page.url.href)}`);
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

		<Flex justifyContent="end" marginTop="medium">
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
