/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { renderCodeSvgs } from '../render/code.js';
import { renderMathSvg } from '../render/math.js';
import { svgToFile } from '../render/svg.js';
import { NoteCommandError, enumOption, requireMain } from '../types.js';
import type { GeneratedFile, NoteCommandSpec } from '../types.js';

type Renderable =
	| { kind: 'code'; language: string | null; code: string }
	| { kind: 'math'; tex: string; display: boolean };

/** Finds fenced code blocks and MFM math (`\( \)` inline, `\[ \]` display) in source order; math inside code is ignored. */
export function findRenderables(content: string): Renderable[] {
	const found: Renderable[] = [];
	const pattern = /```([^\n`]*)\n([\s\S]*?)```|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)/g;
	for (const match of content.matchAll(pattern)) {
		if (match[2] != null) found.push({ kind: 'code', language: match[1].trim() || null, code: match[2] });
		else if (match[3] != null) found.push({ kind: 'math', tex: match[3].trim(), display: true });
		else found.push({ kind: 'math', tex: match[4].trim(), display: false });
	}
	return found;
}

export function codeAltText(language: string | null, code: string, page: number, pages: number): string {
	const header = `コード (${language ?? 'テキスト'})${pages > 1 ? ` ${page}/${pages}` : ''}`;
	return `${header}\n${code}`;
}

export const img: NoteCommandSpec = {
	name: 'img',
	main: 'rest',
	options: ['theme'],
	async run(input) {
		const content = requireMain(input, '%%img ```ts … ```%%');
		const theme = enumOption(input, 'theme', ['light', 'dark'], 'light');
		const renderables = findRenderables(content);
		if (renderables.length === 0) throw new NoteCommandError('画像にするコードブロック (```) か数式 (\\( \\) や \\[ \\]) がありません');

		const files: GeneratedFile[] = [];
		for (const item of renderables) {
			if (item.kind === 'math') {
				files.push(await svgToFile(renderMathSvg(item.tex, item.display), 'math.png', `数式: ${item.tex}`));
				continue;
			}
			if (item.language?.toLowerCase() === 'mermaid') throw new NoteCommandError('Mermaid の図にはまだ対応していません');
			const pages = await renderCodeSvgs(item.code, item.language, theme);
			for (const [i, svg] of pages.entries()) {
				files.push(await svgToFile(svg, 'code.png', codeAltText(item.language, item.code, i + 1, pages.length)));
			}
		}
		return { text: content, files };
	},
};
