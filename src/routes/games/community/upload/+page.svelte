<script lang="ts">
	import {
		Anchor,
		authState,
		Button,
		Checkbox,
		Field,
		Flex,
		Form,
		Icon,
		Link,
		LinkButton,
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
		<p style="color: {token.theme.color.text.secondary}">
			Adding highscores, saves, achievements or multiplayer? The full Davidnet SDK reference — with
			a runnable example for every function, including Godot/GDScript — now lives in the help
			center.
		</p>
		<LinkButton
			href="https://davidnet.net/help/community-games"
			iconbefore="menu_book"
			target="_blank"
			rel="noopener">
			Read the Community Games developer docs
		</LinkButton>
	</Flex>
</Flex>
