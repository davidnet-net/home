<script lang="ts">
	import { Anchor, Icon, type iconType } from "@davidnet-net/svelte-ui";
	import { focusring } from "@davidnet-net/svelte-ui/tokens";
	import type { HTMLAnchorAttributes } from "svelte/elements";

	import { styles } from "./HorizontalCard.css";

	interface Props extends HTMLAnchorAttributes {
		title: string;
		description?: string;
		icon?: iconType;
		//image?: string;
		//darkimage?: string;
		external?: boolean;
	}

	let {
		title,
		description = "",
		external = false,
		icon = "indeterminate_question_box",
		...rest
	}: Props = $props();
</script>

<Anchor {external} {...rest}>
	<div class="{styles.baseCard} {focusring}">
		<div class={styles.illustrationContainer}>
			<Icon size="huge" {icon} />
		</div>
		<div class={styles.contentContainer}>
			<h3>{title}</h3>
			{description}
		</div>
	</div>
</Anchor>
