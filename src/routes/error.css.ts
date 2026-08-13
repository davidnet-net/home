import { token } from "@davidnet-net/svelte-ui/tokens";
import { style } from "@vanilla-extract/css";

const pageContainer = style({
	display: "flex",
	flexDirection: "column",
	alignItems: "center",
	justifyContent: "center",
	height: "100%"
});

const background = style({
	width: "clamp(16rem, 30dvw, 30rem)",
	padding: token.global.spacing.large,
	backgroundColor: token.theme.color.surface.sunken.normal,
	aspectRatio: "1",
	clipPath: `shape(
    from 75% 25%,
    curve to 75% 75% with 100% 50%,
    curve to 25% 75% with 50% 100%,
    curve to 25% 25% with 0% 50%,
    curve to 75% 25% with 50% 0%
  )`,
	display: "flex",
	flexDirection: "column",
	alignItems: "center",
	justifyContent: "center",
	transform: "translateY(-5vw)"
});

const iconBackground = style({
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	padding: token.global.spacing.large,
	borderRadius: token.global.radius.full,
	fontSize: token.global.font.size.giant
});

const errorHeader = style({
	fontSize: token.global.font.size.large
});

const buttonContainer = style({
	transform: "translateY(-6vw)",
	display: "flex",
	gap: token.global.spacing.medium
});

export const backgroundContainer = style({
	filter: `
        drop-shadow(-1px -1px 0 ${token.theme.color.border.default}) 
        drop-shadow(1px -1px 0 ${token.theme.color.border.default}) 
        drop-shadow(-1px 1px 0 ${token.theme.color.border.default}) 
        drop-shadow(1px 1px 0 ${token.theme.color.border.default})
    `
});

export const styles = {
	pageContainer,
	backgroundContainer,
	iconBackground,
	errorHeader,
	background,
	buttonContainer
};
