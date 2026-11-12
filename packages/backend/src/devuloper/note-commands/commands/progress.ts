/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { NoteCommandError, enumOption, intOption, requireMain } from '../types.js';
import type { NoteCommandSpec } from '../types.js';

const BAR_STYLES = {
	block: ['▓', '░'],
	bar: ['█', '░'],
	circle: ['●', '○'],
	square: ['■', '□'],
	emoji: ['🟩', '⬜'],
} as const;

function formatNumber(value: number): string {
	return String(Number(value.toPrecision(12)));
}

export function renderProgressBar(ratio: number, width: number, style: keyof typeof BAR_STYLES): string {
	const [filled, empty] = BAR_STYLES[style];
	const filledCount = Math.round(Math.min(Math.max(ratio, 0), 1) * width);
	return filled.repeat(filledCount) + empty.repeat(width - filledCount);
}

export const progress: NoteCommandSpec = {
	name: 'progress',
	main: 'rest',
	options: ['width', 'style'],
	run(input) {
		const raw = requireMain(input, '%%progress 7|10%%').normalize('NFKC').replace(/\s/g, '');
		const width = intOption(input, 'width', { min: 1, max: 50, fallback: 10 });
		const style = enumOption(input, 'style', Object.keys(BAR_STYLES) as (keyof typeof BAR_STYLES)[], 'block');

		const parts = raw.split(/[|/]/);
		if (parts.length > 2 || parts.some(part => part === '' || !Number.isFinite(Number(part)))) {
			throw new NoteCommandError('値は 7|10 (現在値|最大値) か 70 (パーセント) のように数値で書いてください');
		}

		if (parts.length === 1) {
			const percent = Number(parts[0]);
			return { text: `${renderProgressBar(percent / 100, width, style)} ${formatNumber(percent)}%` };
		}

		const [current, max] = parts.map(Number);
		if (max <= 0) throw new NoteCommandError('最大値は 0 より大きくしてください');
		const percent = Math.round(current / max * 100);
		return { text: `${renderProgressBar(current / max, width, style)} ${formatNumber(current)}/${formatNumber(max)} (${percent}%)` };
	},
};
