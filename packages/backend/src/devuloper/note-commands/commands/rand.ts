/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomInt } from 'node:crypto';
import { NoteCommandError, intOption, splitList } from '../types.js';
import type { NoteCommandSpec } from '../types.js';

const MAX_DICE = 100;
const MAX_FACES = 1000;
const MAX_CHOICES = 100;
const MAX_NUMBER = 1e12;

const OMIKUJI: readonly { label: string; weight: number }[] = [
	{ label: '大吉', weight: 16 },
	{ label: '中吉', weight: 20 },
	{ label: '小吉', weight: 20 },
	{ label: '吉', weight: 20 },
	{ label: '末吉', weight: 14 },
	{ label: '凶', weight: 8 },
	{ label: '大凶', weight: 2 },
];

function pickWeighted<T extends { weight: number }>(items: readonly T[]): T {
	const total = items.reduce((sum, item) => sum + item.weight, 0);
	let roll = randomInt(total);
	for (const item of items) {
		if (roll < item.weight) return item;
		roll -= item.weight;
	}
	return items[items.length - 1];
}

/** Picks `count` distinct items in a random order (partial Fisher–Yates). */
function pickDistinct<T>(items: readonly T[], count: number): T[] {
	const pool = [...items];
	for (let i = 0; i < count; i++) {
		const j = i + randomInt(pool.length - i);
		[pool[i], pool[j]] = [pool[j], pool[i]];
	}
	return pool.slice(0, count);
}

export const randDice: NoteCommandSpec = {
	name: 'rand.dice',
	main: 'word',
	run(input) {
		const notation = (input.main ?? '1d6').normalize('NFKC').toLowerCase();
		const match = /^(\d*)d(\d+)$/.exec(notation);
		if (match == null) throw new NoteCommandError('サイコロは 2d6 のように「個数d面数」で書いてください');
		const count = match[1] === '' ? 1 : Number(match[1]);
		const faces = Number(match[2]);
		if (count < 1 || count > MAX_DICE) throw new NoteCommandError(`サイコロの個数は 1 から ${MAX_DICE} までです`);
		if (faces < 2 || faces > MAX_FACES) throw new NoteCommandError(`サイコロの面数は 2 から ${MAX_FACES} までです`);

		const rolls = Array.from({ length: count }, () => randomInt(1, faces + 1));
		const total = rolls.reduce((sum, roll) => sum + roll, 0);
		const detail = count === 1 ? `${total}` : `${rolls.join(' + ')} = ${total}`;
		return { text: `🎲 ${count}d${faces}: ${detail}` };
	},
};

export const randChoose: NoteCommandSpec = {
	name: 'rand.choose',
	main: 'rest',
	options: ['count'],
	run(input) {
		const choices = splitList(input.main ?? '');
		if (choices.length < 2) throw new NoteCommandError('選択肢を A|B|C のように 2 つ以上書いてください');
		if (choices.length > MAX_CHOICES) throw new NoteCommandError(`選択肢は ${MAX_CHOICES} 個までです`);
		const count = intOption(input, 'count', { min: 1, max: choices.length, fallback: 1 });
		return { text: `🎯 ${pickDistinct(choices, count).join('、')}` };
	},
};

export const randOmikuji: NoteCommandSpec = {
	name: 'rand.omikuji',
	main: 'none',
	run() {
		return { text: `⛩️ おみくじ: ${pickWeighted(OMIKUJI).label}` };
	},
};

export const randNum: NoteCommandSpec = {
	name: 'rand.num',
	main: 'word',
	run(input) {
		const bounds = splitList((input.main ?? '1|100').normalize('NFKC')).map(Number);
		if (bounds.length !== 2 || !bounds.every(Number.isSafeInteger)) {
			throw new NoteCommandError('範囲は 1|100 のように「最小|最大」の整数で書いてください');
		}
		const [min, max] = bounds[0] <= bounds[1] ? bounds : [bounds[1], bounds[0]];
		if (Math.abs(min) > MAX_NUMBER || Math.abs(max) > MAX_NUMBER) throw new NoteCommandError('範囲が大きすぎます');
		// crypto.randomInt only accepts ranges narrower than 2^48.
		const value = min + randomInt(max - min + 1);
		return { text: `🔢 ${min}〜${max}: ${value}` };
	},
};
