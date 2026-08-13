import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Represents the translation statistics for a specific locale.
 */
interface TranslationStats {
	total: number;
	translated: number;
	missing: number;
	percentage: string;
}

/**
 * Represents the final structure of the translations manifest.
 */
interface ManifestOutput {
	namespaces: Record<string, Record<string, TranslationStats>>;
	updatedAt: string;
}

const CONFIG = {
	baseLocale: "en",
	locales: ["en", "nl"],
	namespaces: ["lib", "docs"],
	inputDir: "./translations",
	outputFile: "./src/lib/manifests/translations-manifest.json"
} as const;

/**
 * Berekent de statistieken voor een specifieke namespace en locale.
 * @param namespace - De mapnaam (bijv. 'lib' of 'docs')
 * @param locale - De taalkeuze
 * @param baseKeys - De keys van de baseLocale ter vergelijking
 * @returns De berekende statistieken
 */
const calculateStats = async (
	namespace: string,
	locale: string,
	baseKeys: Set<string>
): Promise<TranslationStats> => {
	const filePath = resolve(CONFIG.inputDir, namespace, `${locale}.json`);
	const file = Bun.file(filePath);

	if (!(await file.exists())) {
		return { total: baseKeys.size, translated: 0, missing: baseKeys.size, percentage: "0%" };
	}

	const content: Record<string, string> = await file.json();
	const currentKeys = Object.keys(content);
	const translatedCount = currentKeys.filter((key) => baseKeys.has(key)).length;
	const missingCount = Math.max(0, baseKeys.size - translatedCount);
	const percentage =
		baseKeys.size > 0 ? `${((translatedCount / baseKeys.size) * 100).toFixed(2)}%` : "100%";

	return {
		total: baseKeys.size,
		translated: translatedCount,
		missing: missingCount,
		percentage
	};
};

/**
 * Genereert het volledige manifest object.
 * @returns Het datamodel voor het manifest
 */
const generateManifestData = async (): Promise<ManifestOutput> => {
	const namespaces: Record<string, Record<string, TranslationStats>> = {};

	for (const ns of CONFIG.namespaces) {
		namespaces[ns] = {};
		const basePath = resolve(CONFIG.inputDir, ns, `${CONFIG.baseLocale}.json`);
		const baseFile = Bun.file(basePath);

		if (!(await baseFile.exists())) continue;

		const baseContent: Record<string, string> = await baseFile.json();
		const baseKeys = new Set(Object.keys(baseContent));

		for (const locale of CONFIG.locales) {
			namespaces[ns][locale] = await calculateStats(ns, locale, baseKeys);
		}
	}

	return {
		namespaces,
		updatedAt: new Date().toISOString()
	};
};

/**
 * Hoofdfunctie voor het schrijven van het manifest naar schijf.
 */
const run = async (): Promise<void> => {
	const start = performance.now();
	try {
		const manifest = await generateManifestData();
		const outputDir = resolve(CONFIG.outputFile, "..");

		if (!existsSync(outputDir)) {
			mkdirSync(outputDir, { recursive: true });
		}

		await Bun.write(CONFIG.outputFile, JSON.stringify(manifest, null, 2));

		const duration = (performance.now() - start).toFixed(2);
		console.log(`✅ Translations manifest generated in ${duration}ms`);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "Unknown error";
		console.error("❌ Fout bij genereren manifest:", errorMessage);
		process.exit(1);
	}
};

await run();
