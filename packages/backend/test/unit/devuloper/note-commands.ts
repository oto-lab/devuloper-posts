/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { banner } from '@/devuloper/note-commands/commands/banner.js';
import { calc, evaluateExpression } from '@/devuloper/note-commands/commands/calc.js';
import { fontCommands } from '@/devuloper/note-commands/commands/font.js';
import { progress } from '@/devuloper/note-commands/commands/progress.js';
import { randChoose, randDice, randNum } from '@/devuloper/note-commands/commands/rand.js';
import { parseTimeInput, time, zonedTimeToTimestamp } from '@/devuloper/note-commands/commands/time.js';
import { unit } from '@/devuloper/note-commands/commands/unit.js';
import { DEFAULT_PREFS, readPrefs } from '@/devuloper/note-commands/prefs.js';
import { findCommands, parseArgs, splitFirstWord } from '@/devuloper/note-commands/syntax.js';
import { NoteCommandError } from '@/devuloper/note-commands/types.js';
import type { NoteCommandContext, NoteCommandInput, NoteCommandSpec } from '@/devuloper/note-commands/types.js';

const isKnown = (name: string) => ['rand', 'qr', 'tr', 'stats'].includes(name.split('.')[0]);

const ctx: NoteCommandContext = {
	user: { id: 'u', username: 'alice', host: null },
	prefs: DEFAULT_PREFS,
	now: new Date('2026-11-12T03:00:00Z'),
};

function input(main: string | null, options: Record<string, string> = {}): NoteCommandInput {
	return { main, text: '', options: new Map(Object.entries(options)) };
}

async function runText(spec: NoteCommandSpec, main: string | null, options: Record<string, string> = {}, context = ctx): Promise<string> {
	return (await spec.run(input(main, options), context)).text;
}

describe('findCommands', () => {
	test('finds commands and their bodies', () => {
		expect(findCommands('a %%rand.dice 2d6%% b %%stats%%', isKnown)).toEqual([
			{ start: 2, end: 19, name: 'rand.dice', body: '2d6' },
			{ start: 22, end: 31, name: 'stats', body: '' },
		]);
	});

	test('leaves unknown names and ordinary percent signs alone', () => {
		expect(findCommands('50%オフ %%foo bar%% 100%%', isKnown)).toEqual([]);
	});

	test('accepts full-width percent signs, spaces and names', () => {
		const [found] = findCommands('％％ｑｒ　中身％％', isKnown);
		expect(found.name).toBe('qr');
		expect(found.body).toBe('中身');
	});

	test('skips code blocks and inline code', () => {
		expect(findCommands('```\n%%qr a%%\n```\n`%%qr b%%`', isKnown)).toEqual([]);
	});

	test('does not close inside a code block in the body', () => {
		const [found] = findCommands('%%qr ```\n%%\n``` %%', isKnown);
		expect(found.body).toBe('```\n%%\n```');
	});

	test('treats \\% as a literal percent sign', () => {
		expect(findCommands('%%qr 50\\%\\% off%%', isKnown)[0].body).toBe('50%% off');
	});

	test('keeps multi-line bodies', () => {
		expect(findCommands('%%tr en 一行目\n二行目%%', isKnown)[0].body).toBe('en 一行目\n二行目');
	});

	test('ignores an unclosed command', () => {
		expect(findCommands('%%qr never closed', isKnown)).toEqual([]);
	});
});

describe('parseArgs', () => {
	test('reads leading known options only', () => {
		const { options, rest } = parseArgs('count:2 A|B https://example.com', new Set(['count']));
		expect([...options]).toEqual([['count', '2']]);
		expect(rest).toBe('A|B https://example.com');
	});

	test('does not treat URLs or times as options', () => {
		expect(parseArgs('https://example.com', new Set(['to'])).rest).toBe('https://example.com');
		expect(parseArgs('21:00', new Set(['zones'])).rest).toBe('21:00');
	});

	test('accepts full-width colon and bar', () => {
		expect(parseArgs('ｚｏｎｅｓ：utc｜pst 21:00', new Set(['zones'])).options.get('zones')).toBe('utc|pst');
	});

	test('splitFirstWord', () => {
		expect(splitFirstWord('en こんにちは\n世界')).toEqual({ word: 'en', remainder: 'こんにちは\n世界' });
		expect(splitFirstWord('  ')).toEqual({ word: null, remainder: '' });
	});
});

describe('rand', () => {
	test('dice stays in range and sums up', async () => {
		for (let i = 0; i < 50; i++) {
			const match = /^🎲 2d6: (\d) \+ (\d) = (\d+)$/.exec(await runText(randDice, '2d6'));
			expect(match).not.toBeNull();
			expect(Number(match![1]) + Number(match![2])).toBe(Number(match![3]));
		}
	});

	test('dice rejects bad notation', async () => {
		await expect(runText(randDice, 'abc')).rejects.toThrow(NoteCommandError);
		await expect(runText(randDice, '1000d6')).rejects.toThrow(NoteCommandError);
	});

	test('choose picks distinct items', async () => {
		const picked = (await runText(randChoose, 'A|B|C', { count: '3' })).replace('🎯 ', '').split('、');
		expect(new Set(picked)).toEqual(new Set(['A', 'B', 'C']));
	});

	test('num accepts reversed bounds', async () => {
		const value = Number((await runText(randNum, '10|5')).split(': ')[1]);
		expect(value).toBeGreaterThanOrEqual(5);
		expect(value).toBeLessThanOrEqual(10);
	});
});

describe('font', () => {
	const convert = (name: string, text: string) => runText(fontCommands.find(spec => spec.name === `font.${name}`)!, text);

	test('maps letters and keeps other characters', async () => {
		expect(await convert('bold', 'Hi 1 あ')).toBe('𝐇𝐢 𝟏 あ');
		expect(await convert('script', 'Hello')).toBe('𝓗𝓮𝓵𝓵𝓸');
		expect(await convert('fraktur', 'Hello')).toBe('ℌ𝔢𝔩𝔩𝔬');
		expect(await convert('double', 'Hello')).toBe('ℍ𝕖𝕝𝕝𝕠');
		expect(await convert('mono', 'Hello')).toBe('𝙷𝚎𝚕𝚕𝚘');
		expect(await convert('italic', 'h')).toBe('ℎ');
		expect(await convert('circle', 'Hello')).toBe('Ⓗⓔⓛⓛⓞ');
		expect(await convert('flip', 'Hello')).toBe('ollǝH');
	});
});

describe('progress', () => {
	test('renders current/max', async () => {
		expect(await runText(progress, '7|10')).toBe('▓▓▓▓▓▓▓░░░ 7/10 (70%)');
	});

	test('renders a percentage and clamps the bar', async () => {
		expect(await runText(progress, '70', { width: '5', style: 'circle' })).toBe('●●●●○ 70%');
		expect(await runText(progress, '150', { width: '4' })).toBe('▓▓▓▓ 150%');
	});

	test('rejects a non-positive max', async () => {
		await expect(runText(progress, '1|0')).rejects.toThrow(NoteCommandError);
	});
});

describe('calc', () => {
	test.each([
		['1200*1.1', 1320],
		['2^3^2', 512],
		['-2^2', -4],
		['(1+2)*3', 9],
		['sqrt(16)+max(1,5,3)', 9],
		['log(100)', 2],
		['１０÷４', 2.5],
		['1,000*3', 3000],
	])('%s', (expression, expected) => {
		expect(Number(evaluateExpression(expression).toPrecision(12))).toBe(expected);
	});

	test.each(['1/0', 'foo(1)', '1+', 'constructor(1)', '(((1)'])('rejects %s', expression => {
		expect(() => evaluateExpression(expression)).toThrow(NoteCommandError);
	});

	test('formats the result', async () => {
		expect(await runText(calc, '1200*1.1')).toBe('1200*1.1 = 1320');
		expect(await runText(calc, '10/3', { result: 'only', digits: '2' })).toBe('3.33');
	});
});

describe('unit', () => {
	test.each([
		['5mi', 'km', '5 mi = 8.05 km'],
		['100 °F', 'c', '100 °F = 37.78 °C'],
		['1 GiB', 'MB', '1 GiB = 1073.74 MB'],
		['1mm', 'km', '1 mm = 0.000001 km'],
		['6畳', 'm2', null],
	])('%s to %s', async (value, to, expected) => {
		if (expected == null) {
			await expect(runText(unit, value, { to })).rejects.toThrow(NoteCommandError);
		} else {
			expect(await runText(unit, value, { to })).toBe(expected);
		}
	});

	test('converts to several units and rejects other dimensions', async () => {
		expect(await runText(unit, '1km', { to: 'm|mi' })).toBe('1 km = 1000 m = 0.62 mi');
		await expect(runText(unit, '1km', { to: 'kg' })).rejects.toThrow(NoteCommandError);
	});

	test('distinguishes bit from byte', async () => {
		expect(await runText(unit, '8b', { to: 'B' })).toBe('8 bit = 1 B');
	});
});

describe('time', () => {
	test('parses supported inputs', () => {
		expect(parseTimeInput('21:00', { year: 2026 })).toEqual({ date: null, hour: 21, minute: 0 });
		expect(parseTimeInput('12/24 9:30', { year: 2026 })).toEqual({ date: { year: 2026, month: 12, day: 24 }, hour: 9, minute: 30 });
		expect(parseTimeInput('2027年1月2日 21時15分', { year: 2026 })).toEqual({ date: { year: 2027, month: 1, day: 2 }, hour: 21, minute: 15 });
		expect(() => parseTimeInput('2026-02-30 10:00', { year: 2026 })).toThrow(NoteCommandError);
	});

	test('handles DST gaps and overlaps', () => {
		// 2026-03-08 02:30 does not exist in New York; 2026-11-01 01:30 happens twice.
		expect(new Date(zonedTimeToTimestamp({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, 'America/New_York')).toISOString()).toBe('2026-03-08T07:30:00.000Z');
		expect(new Date(zonedTimeToTimestamp({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, 'America/New_York')).toISOString()).toBe('2026-11-01T05:30:00.000Z');
	});

	test('converts across zones', async () => {
		expect(await runText(time, '21:00', { zones: 'utc|pst' })).toBe('21:00 JST / 12:00 UTC / 04:00 PST');
		expect(await runText(time, '12/24 08:00', { zones: 'utc|pst' })).toBe('12/24 08:00 JST / 12/23 23:00 UTC / 12/23 15:00 PST');
		expect(await runText(time, '08:00', { zones: 'pst' })).toBe('08:00 JST / 15:00 PST (-1日)');
	});
});

describe('banner', () => {
	test('renders ASCII art in a code block', async () => {
		const text = await runText(banner, 'Hi');
		expect(text.startsWith('```\n')).toBe(true);
		expect(text.endsWith('\n```')).toBe(true);
		expect(text.split('\n').length).toBeGreaterThan(4);
	});

	test('rejects non-ASCII and too wide text', async () => {
		await expect(runText(banner, 'こんにちは')).rejects.toThrow(NoteCommandError);
		await expect(runText(banner, 'This is far too long')).rejects.toThrow(NoteCommandError);
	});
});

describe('readPrefs', () => {
	test('falls back on invalid values', () => {
		expect(readPrefs({ timezone: 'Nowhere/City', timeZones: ['UTC', 1, 'Bad/Zone'], githubUsername: 'a b' })).toEqual({
			...DEFAULT_PREFS,
			timeZones: ['UTC'],
		});
	});
});
