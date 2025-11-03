<script lang="ts">
	import Weather from "$lib/components/Weather.svelte";
	import type { SessionInfo } from "$lib/types";
	import { FlexWrapper, Icon, LinkButton, Space, Button } from "@davidnet/svelte-ui";
	import { onDestroy } from "svelte";

	let width = $state(window.innerWidth);
	const handleResize = () => {
		width = window.innerWidth;
	};

	window.addEventListener("resize", handleResize);
	onDestroy(() => {
		window.removeEventListener("resize", handleResize);
	});
</script>

<FlexWrapper>
	<Space height="var(--token-space-6)" />
</FlexWrapper>

<FlexWrapper width="100%" direction="column">
	<FlexWrapper width="80%" direction="row" justifycontent="flex-start" wrap="wrap" gap="var(--token-space-2)">
		<Button
			iconbefore="arrow_back"
			onClick={() => {
				history.back();
			}}>Back</Button
		>
		<LinkButton iconbefore="home" href="/">Home</LinkButton>
	</FlexWrapper>
	<Space height="var(--token-space-6)" />
</FlexWrapper>

<Space height="var(--token-space-6)" />

<FlexWrapper alignitems="flex-start" width="80%">
	<h2>Utils:</h2>
	<FlexWrapper gap="var(--token-space-3)" justifycontent={width > 600 ? "flex-start" : "space-evenly"} direction="row" wrap="wrap">
		<a class="option" href="https://publitasdownloader.davidnet.net">
			<FlexWrapper width="100%" height="100%" gap="var(--token-space-2)">
				<Icon size="4rem" icon="archive" />
				<p class="option-text">Publitas downloader</p>
			</FlexWrapper>
		</a>
		<a class="option" href="https://noordhoffdownloader.davidnet.net">
			<FlexWrapper width="100%" height="100%" gap="var(--token-space-2)">
				<Icon size="4rem" icon="archive" />
				<p class="option-text">Noordhoff downloader</p>
			</FlexWrapper>
		</a>
	</FlexWrapper>
</FlexWrapper>

<Space height="var(--token-space-4)" />

<style>
	.option {
		text-decoration: none;
		color: var(--token-color-text-default-normal);
		text-align: center;
		border-radius: 2rem;
		background-color: var(--token-color-surface-overlay-normal);
		padding: 0.25rem;
		transition:
			transform 0.4s ease,
			box-shadow 0.4s ease;
		height: 8rem;
		width: 8rem;
	}

	.option:hover {
		background-color: var(--token-color-surface-overlay-hover);
		transform: scale(1.01);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.option:active,
	.option:focus {
		background-color: var(--token-color-surface-overlay-pressed);
	}

	.option:focus {
		outline: 2px solid var(--token-color-focusring);
	}

	.option-text {
		line-height: 1.2;
		margin: 0px;
		font-size: larger;
	}
</style>
