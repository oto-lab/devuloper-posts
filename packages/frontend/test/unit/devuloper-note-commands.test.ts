/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { COMMANDS, buildSyntax } from '@/devuloper/note-commands/catalog.js';

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
