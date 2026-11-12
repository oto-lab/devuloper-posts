/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { requireMain } from '../types.js';
import type { NoteCommandSpec } from '../types.js';

type AlphabetStyle = {
	upper?: number;
	lower?: number;
	digit?: number;
	/** Letters that Unicode placed outside the contiguous block (Letterlike Symbols). */
	holes?: Record<string, string>;
};

const STYLES: Record<string, AlphabetStyle> = {
	bold: { upper: 0x1D400, lower: 0x1D41A, digit: 0x1D7CE },
	italic: { upper: 0x1D434, lower: 0x1D44E, holes: { h: 'ℎ' } },
	bolditalic: { upper: 0x1D468, lower: 0x1D482 },
	script: { upper: 0x1D4D0, lower: 0x1D4EA },
	fraktur: { upper: 0x1D504, lower: 0x1D51E, holes: { C: 'ℭ', H: 'ℌ', I: 'ℑ', R: 'ℜ', Z: 'ℨ' } },
	double: { upper: 0x1D538, lower: 0x1D552, digit: 0x1D7D8, holes: { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' } },
	sans: { upper: 0x1D5A0, lower: 0x1D5BA, digit: 0x1D7E2 },
	mono: { upper: 0x1D670, lower: 0x1D68A, digit: 0x1D7F6 },
};

const FLIPPED: Record<string, string> = {
	a: 'ɐ', b: 'q', c: 'ɔ', d: 'p', e: 'ǝ', f: 'ɟ', g: 'ƃ', h: 'ɥ', i: 'ᴉ', j: 'ɾ', k: 'ʞ', l: 'l', m: 'ɯ',
	n: 'u', o: 'o', p: 'd', q: 'b', r: 'ɹ', s: 's', t: 'ʇ', u: 'n', v: 'ʌ', w: 'ʍ', x: 'x', y: 'ʎ', z: 'z',
	A: '∀', B: 'ᗺ', C: 'Ɔ', D: 'ᗡ', E: 'Ǝ', F: 'Ⅎ', G: '⅁', H: 'H', I: 'I', J: 'ſ', K: 'ꓘ', L: '˥', M: 'W',
	N: 'N', O: 'O', P: 'Ԁ', Q: 'Ό', R: 'ᴚ', S: 'S', T: '⊥', U: '∩', V: 'Λ', W: 'M', X: 'X', Y: '⅄', Z: 'Z',
	1: 'Ɩ', 2: 'ᄅ', 3: 'Ɛ', 4: 'ㄣ', 5: 'ϛ', 6: '9', 7: 'ㄥ', 8: '8', 9: '6', 0: '0',
	'.': '˙', ',': '\'', '\'': ',', '"': '„', '?': '¿', '!': '¡', '(': ')', ')': '(', '[': ']', ']': '[',
	'{': '}', '}': '{', '<': '>', '>': '<', '&': '⅋', _: '‾',
};

function convertWithAlphabet(text: string, style: AlphabetStyle): string {
	return Array.from(text, char => {
		if (style.holes?.[char]) return style.holes[char];
		const code = char.charCodeAt(0);
		if (style.upper != null && char >= 'A' && char <= 'Z') return String.fromCodePoint(style.upper + code - 0x41);
		if (style.lower != null && char >= 'a' && char <= 'z') return String.fromCodePoint(style.lower + code - 0x61);
		if (style.digit != null && char >= '0' && char <= '9') return String.fromCodePoint(style.digit + code - 0x30);
		return char;
	}).join('');
}

function circled(text: string): string {
	return Array.from(text, char => {
		if (char >= 'A' && char <= 'Z') return String.fromCodePoint(0x24B6 + char.charCodeAt(0) - 0x41);
		if (char >= 'a' && char <= 'z') return String.fromCodePoint(0x24D0 + char.charCodeAt(0) - 0x61);
		if (char === '0') return '⓪';
		if (char >= '1' && char <= '9') return String.fromCodePoint(0x2460 + char.charCodeAt(0) - 0x31);
		return char;
	}).join('');
}

/** Turns each line upside down; the line order is reversed too, so the whole block reads rotated. */
function flipped(text: string): string {
	return text.split('\n').reverse().map(line => Array.from(line, char => FLIPPED[char] ?? char).reverse().join('')).join('\n');
}

const USAGE = '%%font.bold Hello%%';

function fontCommand(styleName: string, convert: (text: string) => string): NoteCommandSpec {
	return {
		name: `font.${styleName}`,
		main: 'rest',
		run(input) {
			return { text: convert(requireMain(input, USAGE.replace('bold', styleName))) };
		},
	};
}

export const fontCommands: NoteCommandSpec[] = [
	...Object.entries(STYLES).map(([name, style]) => fontCommand(name, text => convertWithAlphabet(text, style))),
	fontCommand('circle', circled),
	fontCommand('flip', flipped),
];
