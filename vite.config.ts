import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { sveltekit } from "@sveltejs/kit/vite";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		vanillaExtractPlugin(),
		sveltekit(),
		paraglideVitePlugin({
			project: "./project.inlang",
			outdir: "./src/lib/paraglide",
			emitTsDeclarations: true,
			strategy: ["localStorage", "preferredLanguage", "baseLocale"],
			localStorageKey: "language"
		})
	],
	optimizeDeps: {
		exclude: ["@davidnet-net/svelte-ui"]
	},
	ssr: {
		noExternal: ["@davidnet-net/svelte-ui"]
	}
});
