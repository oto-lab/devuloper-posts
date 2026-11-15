/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { NoteCommandError, splitList } from '../types.js';
import type { NoteCommandContext, NoteCommandSpec } from '../types.js';

const MAX_LANGUAGES = 3;
const MAX_SOURCE_LENGTH = 3000;

/** DeepL deprecated the bare EN and PT targets and spells Chinese as ZH-HANS. */
const DEEPL_TARGETS: Record<string, string> = { en: 'EN-US', pt: 'PT-BR', zh: 'ZH-HANS' };

// Mentions, hashtags, URLs, custom emoji, code and MFM function heads must survive translation unchanged.
const KEEP = /```[\s\S]*?```|`[^`\n]+`|https?:\/\/[^\s<>"]+|@[\w.-]+(?:@[\w.-]+)?|#[^\s#.,!?、。！？]+|:[\w+-]+:|\$\[[\w.,=+-]+ ?/g;

function escapeXml(text: string): string {
	return text.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]!);
}

function unescapeXml(text: string): string {
	return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/**
 * Wraps the parts that must not be translated in `<x>` so DeepL leaves them alone with `ignore_tags=x`.
 *
 * @example
 * protectForTranslation('hi @alice') // => 'hi <x>@alice</x>'
 */
export function protectForTranslation(text: string): string {
	let result = '';
	let last = 0;
	for (const match of text.matchAll(KEEP)) {
		result += escapeXml(text.slice(last, match.index)) + `<x>${escapeXml(match[0])}</x>`;
		last = match.index + match[0].length;
	}
	return result + escapeXml(text.slice(last));
}

export function restoreFromTranslation(xml: string): string {
	return unescapeXml(xml.replace(/<\/?x>/g, ''));
}

export function parseTargets(raw: string | null): { code: string; deepl: string }[] {
	const codes = splitList((raw ?? '').normalize('NFKC').toLowerCase());
	if (codes.length === 0) throw new NoteCommandError('翻訳先の言語を en のように指定してください');
	if (codes.length > MAX_LANGUAGES) throw new NoteCommandError(`翻訳先の言語は ${MAX_LANGUAGES} つまでです`);
	return codes.map(code => {
		if (!/^[a-z]{2}(?:-[a-z]{2,4})?$/.test(code)) throw new NoteCommandError(`言語コードが正しくありません: ${code}`);
		return { code, deepl: DEEPL_TARGETS[code] ?? code.toUpperCase() };
	});
}

async function translate(ctx: NoteCommandContext, text: string, target: string): Promise<string> {
	const { meta, httpRequestService } = ctx.services;
	const params = new URLSearchParams();
	params.append('text', protectForTranslation(text));
	params.append('target_lang', target);
	params.append('tag_handling', 'xml');
	params.append('ignore_tags', 'x');

	try {
		const res = await httpRequestService.send(meta.deeplIsPro ? 'https://api.deepl.com/v2/translate' : 'https://api-free.deepl.com/v2/translate', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Authorization': `DeepL-Auth-Key ${meta.deeplAuthKey}`,
				'Accept': 'application/json',
			},
			body: params.toString(),
			timeout: 15000,
		});
		const json = await res.json() as { translations: { text: string }[] };
		return restoreFromTranslation(json.translations[0].text);
	} catch {
		throw new NoteCommandError(`${target} への翻訳に失敗しました。言語コードを確かめてください`);
	}
}

export const tr: NoteCommandSpec = {
	name: 'tr',
	main: 'word',
	mainKey: 'to',
	takesText: true,
	wholeNote: true,
	async run(input, ctx) {
		if (ctx.services.meta.deeplAuthKey == null) throw new NoteCommandError('このサーバーでは翻訳が設定されていません');
		if (!(await ctx.services.roleService.getUserPolicies(ctx.user.id)).canUseTranslator) throw new NoteCommandError('翻訳を使う権限がありません');

		const targets = parseTargets(input.main);
		const source = input.text !== '' ? input.text : ctx.noteText ?? '';
		if (source.trim() === '') throw new NoteCommandError('翻訳する文章がありません');
		if (source.length > MAX_SOURCE_LENGTH) throw new NoteCommandError(`翻訳する文章は ${MAX_SOURCE_LENGTH} 文字までです`);

		const translations: string[] = [];
		for (const target of targets) {
			translations.push(`[${target.code.toUpperCase()}] ${await translate(ctx, source, target.deepl)}`);
		}
		// With inline text the original stays in place; for the whole note the original is already in the note.
		return { text: [...(input.text !== '' ? [input.text] : []), ...translations].join('\n\n') };
	},
};
