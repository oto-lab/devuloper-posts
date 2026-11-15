/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { COMMANDS, buildSyntax, describeSyntax } from '@/devuloper/note-commands/catalog.js';

const command = (name: string) => COMMANDS.find(def => def.name === name)!;

describe('buildSyntax', () => {
	test('writes options before the main argument and skips defaults', () => {
		expect(buildSyntax(command('progress'), { value: '7|10', width: '10', style: 'circle' })).toBe('%%progress style:circle 7|10%%');
	});

	test('writes boolean options with their on value', () => {
		expect(buildSyntax(command('calc'), { expression: '1+1', result: true, digits: '' })).toBe('%%calc result:only 1+1%%');
	});

	test('removes spaces from option values and escapes percent signs', () => {
		expect(buildSyntax(command('unit'), { value: '50%', to: 'km | m' })).toBe('%%unit to:km|m 50\\%%%');
	});

	test('writes commands without fields', () => {
		expect(buildSyntax(command('rand.omikuji'), {})).toBe('%%rand.omikuji%%');
	});
});

describe('buildSyntax for images', () => {
	test('writes spaces in titles and labels as underscores', () => {
		expect(buildSyntax(command('chart.bar'), { values: '3|5', labels: '月曜 | 火曜', title: '今週 の 数', series: '' })).toBe('%%chart.bar labels:月曜|火曜 title:今週_の_数 3|5%%');
	});
});

describe('describeSyntax', () => {
	test('shows options as optional and arguments by label', () => {
		expect(describeSyntax(command('rand.choose'))).toBe('%%rand.choose [count:…] <選択肢 (| 区切り)>%%');
		expect(describeSyntax(command('qr'))).toBe('%%qr [hide:on] [size:…] [ecc:l|m|q|h] <中身 (URL や文章)>%%');
		expect(describeSyntax(command('rand.omikuji'))).toBe('%%rand.omikuji%%');
	});
});
