/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, assert, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/vue';
import * as Misskey from 'misskey-js';
import { components } from '@/components/index.js';
import { directives } from '@/directives/index.js';
import MkMfm from '@/components/global/MkMfm.js';

describe('MkMfm gal-moji speech', () => {
	const text = 'なにかな';
	const galText = 'ﾅょﾚﾆｶゝﾅょ';
	const catGalText = 'ﾚﾆ兯ﾚﾆｶゝﾚﾆ兯';

	const renderText = (author: Partial<Misskey.entities.UserLite>, nyaize: boolean | 'respect' = 'respect', mfmText = text): string => {
		const result = render(MkMfm, {
			props: { text: mfmText, author: author as Misskey.entities.UserLite, nyaize, plain: true },
			global: { directives, components },
		});
		return result.container.textContent ?? '';
	};

	afterEach(() => {
		cleanup();
	});

	test('converts the text of a gal author', () => {
		assert.strictEqual(renderText({ isGal: true }), galText);
	});

	test('leaves the text of other authors untouched', () => {
		assert.strictEqual(renderText({ isGal: false }), text);
		assert.strictEqual(renderText({}), text);
	});

	test('does not convert when nyaize is not respected', () => {
		assert.strictEqual(renderText({ isGal: true }, false), text);
	});

	test('applies gal-moji on top of cat speech', () => {
		assert.strictEqual(renderText({ isCat: true, isGal: true }), catGalText);
	});

	test('keeps URLs intact', () => {
		const url = 'https://example.com/a';
		assert.include(renderText({ isGal: true }, 'respect', `${text} ${url}`), url);
	});
});
