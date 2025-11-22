<script lang="ts">
	import { FlexWrapper, Icon, Space, Button, toast, LinkButton } from "@davidnet/svelte-ui";
	import { browser } from "$app/environment";
	import { tick } from "svelte";

	export let correlationID = "Unknown";
	export let pageName = "Unknown";
	export let errorMSG = "Unknown";

	async function copyToClipboard() {
		if (!browser) return;

		try {
			const clipboardText = `DN_Account
Page: ${pageName}
Message: ${errorMSG}
CorrelationID: ${correlationID}
Date: ${new Date()}`;

			await navigator.clipboard.writeText(clipboardText);
			await tick();
			toast({
				title: "Error copied!",
				icon: "content_copy",
				appearance: "success",
				position: "bottom-left",
				autoDismiss: 2000
			});
		} catch {
			toast({
				title: "Copy failed!",
				desc: "We couldn't access your clipboard.",
				icon: "content_copy",
				appearance: "danger",
				position: "bottom-left",
				autoDismiss: 5000
			});
		}
	}
</script>

<h1 style="text-align: center; font-size: 1.8rem;">{pageName}</h1>
<FlexWrapper height="100%" width="100%">
	<Icon icon="crisis_alert" size="100px;" color="var(--token-color-text-warning)" />
	<h1 style="text-align: center;">Error</h1>
	<p role="alert" aria-live="assertive" style="text-align: center;">{errorMSG}</p>
	<p style="font-weight: bold;">CorrelationID:</p>
	<span style="text-align:center; font-size: 0.8rem;">{correlationID}</span>
	<Space height="var(--token-space-6)" />
	<Button
		onClick={() => {
			history.back();
		}}>Navigate back</Button
	>
	<Space height="var(--token-space-4)" />
	<Button
		appearance="primary"
		onClick={() => {
			window.location.reload();
		}}>Reset</Button
	>
	<Space height="var(--token-space-4)" />
	<Button onClick={copyToClipboard} appearance="discover">Copy Error</Button>
	<Space height="var(--token-space-4)" />
	<LinkButton href="mailto:contact@davidnet.net">Need help?</LinkButton>
</FlexWrapper>
