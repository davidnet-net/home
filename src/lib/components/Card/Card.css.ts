import { token } from "@davidnet-net/svelte-ui/tokens";
import { style } from "@vanilla-extract/css";

const baseCard = style({
	backgroundColor: token.theme.color.surface.raised.normal,
	height: "20rem",
	width: "14rem",
	display: "flex",
	alignContent: "center",
	flexDirection: "column",
	lineHeight: token.global.font.lineHeight.normal,
	borderRadius: token.global.radius.huge,
	color: token.theme.color.text.default,
	margin: token.global.borderWidth.thick,
	outlineWidth: token.global.borderWidth.standard,
	outlineStyle: "solid",
	outlineColor: token.theme.color.border.default,
	":hover": {
		outlineWidth: token.global.borderWidth.thick,
		outlineColor: token.theme.color.border.highlighted,
		color: token.theme.color.text.secondary
	}
});

const illustrationContainer = style({
	display: "flex",
	flexDirection: "column",
	justifyContent: "center",
	alignItems: "center",
	height: "50%",
	width: "100%",
	backgroundColor: token.theme.color.surface.sunken.normal,
	borderTopLeftRadius: token.global.radius.huge,
	borderTopRightRadius: token.global.radius.huge
});

const contentContainer = style({
	padding: token.global.spacing.medium
});

export const styles = {
	baseCard,
	illustrationContainer,
	contentContainer
};
