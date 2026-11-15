/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { detectSource, firstLine, parseGitHubTarget } from '@/devuloper/note-commands/commands/card.js';
import { languageOf, parseCodeReference } from '@/devuloper/note-commands/commands/code.js';
import { parseContributionsHtml } from '@/devuloper/note-commands/commands/contrib.js';
import { formatCount } from '@/devuloper/note-commands/render/card.js';
import { wrapText } from '@/devuloper/note-commands/render/svg.js';
import { NoteCommandError } from '@/devuloper/note-commands/types.js';

describe('code', () => {
	test('reads GitHub blob URLs', () => {
		expect(parseCodeReference('https://github.com/o/r/blob/abc123/src/a.ts#L10-L20', new Map())).toEqual({
			owner: 'o', repo: 'r', ref: 'abc123', path: 'src/a.ts', start: 10, end: 20,
		});
		expect(parseCodeReference('https://github.com/o/r/blob/main/a.ts#L5', new Map())).toMatchObject({ start: 5, end: 5 });
	});

	test('reads the short form with options', () => {
		expect(parseCodeReference('o/r /src/a.ts', new Map([['lines', '3|4'], ['ref', 'dev']]))).toEqual({
			owner: 'o', repo: 'r', ref: 'dev', path: 'src/a.ts', start: 3, end: 4,
		});
	});

	test('rejects bad references and ranges', () => {
		expect(() => parseCodeReference('not a reference', new Map())).toThrow(NoteCommandError);
		expect(() => parseCodeReference('o/r a.ts', new Map([['lines', '20|10']]))).toThrow(NoteCommandError);
	});

	test('guesses the language from the file name', () => {
		expect(languageOf('src/a.ts')).toBe('ts');
		expect(languageOf('Dockerfile')).toBe('docker');
		expect(languageOf('LICENSE')).toBeNull();
	});
});

describe('contrib', () => {
	test('reads levels and counts from the contributions HTML', () => {
		const html = [
			'<td data-date="2026-01-02" id="contribution-day-component-1-0" data-level="2" class="ContributionCalendar-day"></td>',
			'<td data-date="2026-01-01" id="contribution-day-component-0-0" data-level="0" class="ContributionCalendar-day"></td>',
			'<tool-tip for="contribution-day-component-0-0" class="sr-only">No contributions on January 1st.</tool-tip>',
			'<tool-tip for="contribution-day-component-1-0" class="sr-only">1,234 contributions on January 2nd.</tool-tip>',
		].join('');
		expect(parseContributionsHtml(html)).toEqual([
			{ date: '2026-01-01', count: 0, level: 0 },
			{ date: '2026-01-02', count: 1234, level: 2 },
		]);
	});
});

describe('card', () => {
	test.each([
		['owner/repo', { kind: 'repo', owner: 'owner', repo: 'repo' }],
		['owner/repo#12', { kind: 'issue', owner: 'owner', repo: 'repo', number: 12 }],
		['owner/repo@abc1234', { kind: 'commit', owner: 'owner', repo: 'repo', sha: 'abc1234' }],
		['otnc', { kind: 'user', login: 'otnc' }],
		['https://github.com/o/r/pull/3', { kind: 'issue', owner: 'o', repo: 'r', number: 3, pull: true }],
		['https://github.com/o/r/releases/tag/v1.0', { kind: 'release', owner: 'o', repo: 'r', tag: 'v1.0' }],
		['https://github.com/o/r/discussions/9', { kind: 'discussion', owner: 'o', repo: 'r', number: 9 }],
		['https://gist.github.com/u/0123abcd', { kind: 'gist', id: '0123abcd' }],
	])('parses %s', (raw, expected) => {
		expect(parseGitHubTarget(raw)).toEqual(expected);
	});

	test('detects the source from a URL', () => {
		expect(detectSource('https://github.com/o/r')).toBe('gh');
		expect(detectSource('https://www.npmjs.com/package/galjp')).toBe('npm');
		expect(detectSource('https://hub.docker.com/_/redis')).toBe('docker');
		expect(detectSource('https://example.com/')).toBe('ogp');
		expect(() => detectSource('galjp')).toThrow(NoteCommandError);
	});

	test('takes the first line of prose from Markdown', () => {
		expect(firstLine('### Note\n\n- **Breaking**: see [the docs](https://example.com) for `x`')).toBe('Breaking: see the docs for x');
		expect(firstLine('## Only a heading')).toBeNull();
		expect(firstLine(null)).toBeNull();
	});

	test('formats counts', () => {
		expect([999, 1234, 1_710_000_000].map(formatCount)).toEqual(['999', '1.23k', '1.71B']);
	});
});

describe('wrapText', () => {
	test('wraps at spaces and cuts with an ellipsis', () => {
		const lines = wrapText('one two three four five six seven', 20, 100, 2);
		expect(lines).toHaveLength(2);
		expect(lines[1].endsWith('…')).toBe(true);
		expect(wrapText('日本語の長い文章です', 20, 100, 3).join('')).toBe('日本語の長い文章です');
	});
});
