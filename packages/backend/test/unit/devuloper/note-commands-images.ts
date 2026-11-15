/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import sharp from 'sharp';
import { parseChartData } from '@/devuloper/note-commands/commands/chart.js';
import { findRenderables } from '@/devuloper/note-commands/commands/img.js';
import { qr } from '@/devuloper/note-commands/commands/qr.js';
import { resolveRange } from '@/devuloper/note-commands/commands/stats.js';
import { niceAxis } from '@/devuloper/note-commands/render/chart.js';
import { renderCodeSvgs } from '@/devuloper/note-commands/render/code.js';
import { renderMathSvg } from '@/devuloper/note-commands/render/math.js';
import { splitEmoji, twemojiFileName } from '@/devuloper/note-commands/render/svg.js';
import { NoteCommandError } from '@/devuloper/note-commands/types.js';
import type { NoteCommandInput } from '@/devuloper/note-commands/types.js';

function input(main: string | null, options: Record<string, string> = {}): NoteCommandInput {
	return { main, text: '', options: new Map(Object.entries(options)) };
}

describe('chart', () => {
	test('parses series, labels and titles', () => {
		expect(parseChartData('bar', input('3|5/4|1', { labels: '月|火', title: '今週_の数', series: 'A|B' }))).toEqual({
			kind: 'bar',
			title: '今週 の数',
			labels: ['月', '火'],
			series: [{ name: 'A', values: [3, 5] }, { name: 'B', values: [4, 1] }],
		});
	});

	test('numbers missing labels', () => {
		expect(parseChartData('line', input('1|2|3')).labels).toEqual(['1', '2', '3']);
	});

	test.each([
		['bar', '1|x'],
		['bar', '1|2/3'],
		['circle', '1|2/3|4'],
		['circle', '-1|2'],
		['circle', '0|0'],
	] as const)('rejects %s %s', (kind, values) => {
		expect(() => parseChartData(kind, input(values))).toThrow(NoteCommandError);
	});

	test('axis includes zero and lands on round steps', () => {
		expect(niceAxis([3, 5, 2, 8])).toEqual({ min: 0, max: 8, step: 2 });
		expect(niceAxis([-1, 8])).toEqual({ min: -2, max: 8, step: 2 });
	});
});

describe('img', () => {
	test('finds code blocks and math in order', () => {
		expect(findRenderables('a\n```ts\nconst a = 1;\n```\n\\( x^2 \\) \\[ y \\]')).toEqual([
			{ kind: 'code', language: 'ts', code: 'const a = 1;\n' },
			{ kind: 'math', tex: 'x^2', display: false },
			{ kind: 'math', tex: 'y', display: true },
		]);
	});

	test('ignores math inside code blocks', () => {
		expect(findRenderables('```\n\\( x \\)\n```')).toEqual([{ kind: 'code', language: null, code: '\\( x \\)\n' }]);
	});

	test('splits long code into pages', async () => {
		const code = Array.from({ length: 120 }, (_, i) => `line ${i}`).join('\n');
		expect(await renderCodeSvgs(code, 'unknown-language', 'light')).toHaveLength(3);
	});

	test('renders math and rejects broken TeX', async () => {
		const png = await sharp(Buffer.from(renderMathSvg('e^{i\\pi}+1=0', true))).png().toBuffer();
		expect((await sharp(png).metadata()).width).toBeGreaterThan(100);
		expect(() => renderMathSvg('\\frac{1', true)).toThrow(NoteCommandError);
	});
});

describe('qr', () => {
	test('hides the content from both the text and the alt text', async () => {
		const output = await qr.run(input('secret', { hide: 'on' }), {} as never);
		expect(output.text).toBe('');
		expect(output.files?.[0].comment).toBe('QR コード');
		expect(output.files?.[0].data.subarray(1, 4).toString()).toBe('PNG');
	});
});

describe('stats ranges', () => {
	const today = { year: 2026, month: 11, day: 12 };

	test.each([
		['week', 'mon', { year: 2026, month: 11, day: 9 }, 7],
		['week', 'sun', { year: 2026, month: 11, day: 8 }, 7],
		['lastweek', 'mon', { year: 2026, month: 11, day: 2 }, 7],
		['month', 'mon', { year: 2026, month: 11, day: 1 }, 30],
		['lastmonth', 'mon', { year: 2026, month: 10, day: 1 }, 31],
		['year', 'mon', { year: 2026, month: 1, day: 1 }, 365],
		['30', 'mon', { year: 2026, month: 10, day: 14 }, 30],
	] as const)('%s (%s)', (word, weekStart, start, days) => {
		const range = resolveRange(word, today, weekStart);
		expect(range.start).toEqual(start);
		expect(range.days).toBe(days);
	});

	test('rejects unknown ranges', () => {
		expect(() => resolveRange('400', today, 'mon')).toThrow(NoteCommandError);
		expect(() => resolveRange('someday', today, 'mon')).toThrow(NoteCommandError);
	});
});

describe('emoji', () => {
	test('builds Twemoji file names like the frontend', () => {
		expect(twemojiFileName('👍')).toBe('1f44d.svg');
		expect(twemojiFileName('❤️')).toBe('2764.svg');
		expect(twemojiFileName('👨‍💻')).toBe('1f468-200d-1f4bb.svg');
	});

	test('splits emoji from text', () => {
		expect(splitEmoji('a👍b🇯🇵')).toEqual([
			{ emoji: false, text: 'a' }, { emoji: true, text: '👍' }, { emoji: false, text: 'b' }, { emoji: true, text: '🇯🇵' },
		]);
	});
});
