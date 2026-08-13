import { token } from "@davidnet-net/svelte-ui/tokens";
import { style } from "@vanilla-extract/css";

const patternBaseColor = token.theme.color.surface.overlay.normal;
const patternStripeColor = token.theme.color.surface.overlay.hover;

export const banner = style({
	width: "90%",
	height: "10rem",
	backgroundColor: token.theme.color.surface.overlay.normal,
	borderRadius: token.global.radius.huge,
	opacity: "1",
	backgroundImage: `repeating-radial-gradient( circle at 0 0, ${patternStripeColor} 0, ${patternStripeColor} 20px ), repeating-linear-gradient( ${patternBaseColor}, ${patternBaseColor} )`
});
