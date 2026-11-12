/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import figlet from 'figlet';
import big from 'figlet/fonts/Big';
import mini from 'figlet/fonts/Mini';
import shadow from 'figlet/fonts/Shadow';
import slant from 'figlet/fonts/Slant';
import small from 'figlet/fonts/Small';
import standard from 'figlet/fonts/Standard';
import { NoteCommandError, enumOption, requireMain } from '../types.js';
import type { NoteCommandSpec } from '../types.js';

/** Wider lines wrap on phones and break the art. */
const MAX_WIDTH = 48;
const MAX_LINES = 4;

// The fonts are imported as strings because the backend is bundled and figlet's default loader reads font files from its package directory.
const FONTS = { standard, slant, small, big, mini, shadow } as const;
type FontName = keyof typeof FONTS;
const loadedFonts = new Set<FontName>();

export function renderBanner(text: string, font: FontName): string {
	if (!loadedFonts.has(font)) {
		figlet.parseFont(font, FONTS[font]);
		loadedFonts.add(font);
	}
	return text.split('\n').map(line => figlet.textSync(line, { font })
		.split('\n').map(row => row.trimEnd()).join('\n').replace(/\n+$/, '')).join('\n');
}

export const banner: NoteCommandSpec = {
	name: 'banner',
	main: 'rest',
	options: ['font'],
	run(input) {
		const text = requireMain(input, '%%banner Hello%%').normalize('NFKC').trim();
		if (!/^[\x20-\x7E\n]+$/.test(text)) throw new NoteCommandError('使える文字は半角の英数字と記号だけです');
		if (text.split('\n').length > MAX_LINES) throw new NoteCommandError(`${MAX_LINES} 行までです`);
		const font = enumOption(input, 'font', Object.keys(FONTS) as FontName[], 'standard');

		const art = renderBanner(text, font);
		const width = Math.max(...art.split('\n').map(row => row.length));
		if (width > MAX_WIDTH) {
			throw new NoteCommandError(`横幅が ${width} 文字になり、上限の ${MAX_WIDTH} 文字を超えます。文字を減らすか、改行するか、font:small を試してください`);
		}
		return { text: `\`\`\`\n${art}\n\`\`\`` };
	},
};
