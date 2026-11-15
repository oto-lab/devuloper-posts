/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { bundledLanguages, bundledLanguagesAlias, createHighlighter, createJavaScriptRegexEngine } from 'shiki';
import { MONO, columnWidth, escapeXml } from './svg.js';
import type { BundledLanguage, Highlighter } from 'shiki';

export type CodeTheme = 'light' | 'dark';

const THEMES = { light: 'github-light', dark: 'github-dark' } as const;
const FONT_SIZE = 22;
const LINE_HEIGHT = 32;
const CHAR_WIDTH = FONT_SIZE * 0.602;
const PADDING = 32;
/** Longer lines are cut so the image stays readable when scaled down on phones. */
export const MAX_COLUMNS = 100;
export const LINES_PER_IMAGE = 50;

let highlighterPromise: Promise<Highlighter> | null = null;

// The JavaScript regex engine avoids loading oniguruma's WebAssembly into the bundled backend.
function getHighlighter(): Promise<Highlighter> {
	highlighterPromise ??= createHighlighter({ themes: Object.values(THEMES), langs: [], engine: createJavaScriptRegexEngine({ forgiving: true }) });
	return highlighterPromise;
}

export function resolveLanguage(name: string | null): BundledLanguage | null {
	const key = (name ?? '').trim().toLowerCase();
	if (key === '') return null;
	if (key in bundledLanguages) return key as BundledLanguage;
	if (key in bundledLanguagesAlias) return key as BundledLanguage;
	return null;
}

function truncateLine(tokens: { content: string; color?: string }[]): { content: string; color?: string }[] {
	const result: { content: string; color?: string }[] = [];
	let columns = 0;
	for (const token of tokens) {
		const content = token.content.replaceAll('\t', '    ');
		if (columns + columnWidth(content) <= MAX_COLUMNS) {
			result.push({ ...token, content });
			columns += columnWidth(content);
			continue;
		}
		let cut = '';
		for (const char of content) {
			if (columns + columnWidth(cut + char) > MAX_COLUMNS - 1) break;
			cut += char;
		}
		result.push({ ...token, content: `${cut}…` });
		break;
	}
	return result;
}

/**
 * Renders highlighted code as SVG pages of up to LINES_PER_IMAGE lines each.
 * Unknown languages are drawn without highlighting.
 */
export async function renderCodeSvgs(code: string, language: string | null, theme: CodeTheme): Promise<string[]> {
	const highlighter = await getHighlighter();
	const lang = resolveLanguage(language);
	if (lang != null) await highlighter.loadLanguage(lang);
	const { tokens, bg, fg } = highlighter.codeToTokens(code.replace(/\n$/, ''), { lang: lang ?? 'text', theme: THEMES[theme] });

	const pages: string[] = [];
	for (let start = 0; start < tokens.length; start += LINES_PER_IMAGE) {
		const lines = tokens.slice(start, start + LINES_PER_IMAGE).map(truncateLine);
		const gutter = String(start + lines.length).length + 2;
		const columns = Math.max(20, ...lines.map(line => columnWidth(line.map(token => token.content).join(''))));
		const width = Math.ceil(PADDING * 2 + (gutter + columns) * CHAR_WIDTH);
		const height = PADDING * 2 + lines.length * LINE_HEIGHT;
		const background = bg ?? (theme === 'dark' ? '#0d1117' : '#ffffff');
		const foreground = fg ?? (theme === 'dark' ? '#e6edf3' : '#1f2328');

		const body = lines.map((line, i) => {
			const y = PADDING + (i + 0.75) * LINE_HEIGHT;
			const number = `<text x="${PADDING + (gutter - 2) * CHAR_WIDTH}" y="${y}" text-anchor="end" fill="${foreground}" fill-opacity="0.4">${start + i + 1}</text>`;
			const spans = line.map(token => `<tspan fill="${token.color ?? foreground}">${escapeXml(token.content)}</tspan>`).join('');
			return `${number}<text x="${PADDING + gutter * CHAR_WIDTH}" y="${y}" xml:space="preserve">${spans}</text>`;
		}).join('');
		pages.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${MONO}" font-size="${FONT_SIZE}"><rect width="${width}" height="${height}" rx="12" fill="${background}"/>${body}</svg>`);
	}
	return pages;
}
