/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import type { GeneratedFile } from '../types.js';

// librsvg resolves these through fontconfig; the server needs fonts-noto-cjk for Japanese text.
export const SANS = '\'Noto Sans CJK JP\', \'DejaVu Sans\', sans-serif';
export const MONO = '\'DejaVu Sans Mono\', \'Noto Sans Mono CJK JP\', monospace';

export const PALETTE = {
	background: '#ffffff',
	surface: '#f4f5f7',
	text: '#1f2328',
	muted: '#656d76',
	grid: '#d8dee4',
	accent: '#86b300',
	series: ['#2f80ed', '#eb5757', '#27ae60', '#f2994a', '#9b51e0', '#56ccf2', '#bdbdbd', '#f2c94c', '#6fcf97', '#bb6bd9', '#2d9cdb', '#219653'],
};

export function escapeXml(text: string): string {
	return text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&apos;' })[char]!);
}

function isWide(char: string): boolean {
	const code = char.codePointAt(0)!;
	return code >= 0x1100 && (
		code <= 0x115F || (code >= 0x2E80 && code <= 0xA4CF) || (code >= 0xAC00 && code <= 0xD7A3) ||
		(code >= 0xF900 && code <= 0xFAFF) || (code >= 0xFE30 && code <= 0xFE4F) || (code >= 0xFF00 && code <= 0xFF60) ||
		(code >= 0xFFE0 && code <= 0xFFE6) || code >= 0x1F300
	);
}

/** Display width in columns: 2 for CJK and emoji, 1 otherwise. Used for monospace layout and rough proportional estimates. */
export function columnWidth(text: string): number {
	let width = 0;
	for (const char of text) width += isWide(char) ? 2 : 1;
	return width;
}

/** A rough width for proportional text; librsvg cannot measure text for us before rendering. */
export function estimateTextWidth(text: string, fontSize: number): number {
	return columnWidth(text) * fontSize * 0.55;
}

/** Cuts `text` so that its estimated width fits `maxWidth`, adding an ellipsis when cut. */
export function fitText(text: string, fontSize: number, maxWidth: number): string {
	if (estimateTextWidth(text, fontSize) <= maxWidth) return text;
	let result = '';
	for (const char of text) {
		if (estimateTextWidth(`${result}${char}…`, fontSize) > maxWidth) break;
		result += char;
	}
	return `${result}…`;
}

/**
 * Breaks `text` into at most `maxLines` lines of estimated width `maxWidth`.
 * Breaks prefer spaces but fall back to any character, since Japanese has none; the last line gets an ellipsis when cut.
 */
export function wrapText(text: string, fontSize: number, maxWidth: number, maxLines: number): string[] {
	const lines: string[] = [];
	let rest = text.replace(/\s+/g, ' ').trim();
	while (rest !== '' && lines.length < maxLines) {
		if (estimateTextWidth(rest, fontSize) <= maxWidth) {
			lines.push(rest);
			rest = '';
			break;
		}
		let cut = 0;
		let width = 0;
		for (const char of rest) {
			width += estimateTextWidth(char, fontSize);
			if (width > maxWidth) break;
			cut += char.length;
		}
		const space = rest.lastIndexOf(' ', cut);
		const end = space > cut * 0.6 ? space : cut;
		lines.push(rest.slice(0, end).trim());
		rest = rest.slice(end).trim();
	}
	if (rest !== '' && lines.length > 0) lines[lines.length - 1] = fitText(`${lines[lines.length - 1]}…`, fontSize, maxWidth);
	return lines;
}

export async function svgToPng(svg: string): Promise<Buffer> {
	return await sharp(Buffer.from(svg)).png().toBuffer();
}

export async function svgToFile(svg: string, name: string, comment: string): Promise<GeneratedFile> {
	return { name, type: 'image/png', data: await svgToPng(svg), comment };
}

/**
 * Builds the Twemoji file name the same way frontend-shared's char2twemojiFilePath does.
 * FE0F is dropped unless the emoji is a ZWJ sequence.
 */
export function twemojiFileName(emoji: string): string {
	let codes = Array.from(emoji, char => char.codePointAt(0)!.toString(16));
	if (!codes.includes('200d')) codes = codes.filter(code => code !== 'fe0f');
	return `${codes.join('-')}.svg`;
}

const twemojiCache = new Map<string, string | null>();

/**
 * Returns `emoji` as a nested <svg> drawn from Misskey's bundled Twemoji, or null when there is no such file.
 * librsvg renders color emoji fonts as broken monochrome glyphs, so emoji are always drawn this way.
 */
export function twemojiSvg(rootDir: string, emoji: string, x: number, y: number, size: number): string | null {
	const fileName = twemojiFileName(emoji);
	if (!twemojiCache.has(fileName)) {
		try {
			const source = readFileSync(resolve(rootDir, 'packages/backend/node_modules/@misskey-dev/emoji-assets/built/twemoji', fileName), 'utf8');
			twemojiCache.set(fileName, source.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, ''));
		} catch {
			twemojiCache.set(fileName, null);
		}
	}
	const inner = twemojiCache.get(fileName);
	return inner == null ? null : `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 36 36">${inner}</svg>`;
}

/** Splits text into runs of emoji and plain text so emoji can be drawn with Twemoji. */
export function splitEmoji(text: string): { emoji: boolean; text: string }[] {
	const pattern = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*|[\u{1F1E6}-\u{1F1FF}]{2}/gu;
	const runs: { emoji: boolean; text: string }[] = [];
	let last = 0;
	for (const match of text.matchAll(pattern)) {
		if (match.index > last) runs.push({ emoji: false, text: text.slice(last, match.index) });
		runs.push({ emoji: true, text: match[0] });
		last = match.index + match[0].length;
	}
	if (last < text.length) runs.push({ emoji: false, text: text.slice(last) });
	return runs;
}

/**
 * Draws a single line of text in which emoji are replaced by Twemoji images.
 * Plain runs are positioned by estimated width, so spacing is approximate.
 */
export function textWithEmoji(rootDir: string, text: string, x: number, baseline: number, fontSize: number, attributes: string): string {
	let cursor = x;
	return splitEmoji(text).map(run => {
		const start = cursor;
		if (run.emoji) {
			cursor += fontSize * 1.1;
			const svg = twemojiSvg(rootDir, run.text, start, baseline - fontSize * 0.88, fontSize);
			if (svg != null) return svg;
		} else {
			cursor += estimateTextWidth(run.text, fontSize);
		}
		return `<text x="${start}" y="${baseline}" font-size="${fontSize}" ${attributes}>${escapeXml(run.text)}</text>`;
	}).join('');
}
