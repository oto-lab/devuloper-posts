/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { cached, fetchText, githubHeaders } from '../external.js';
import { renderCodeSvgs } from '../render/code.js';
import { svgToFile } from '../render/svg.js';
import { NoteCommandError, flagOption, requireMain, splitList } from '../types.js';
import { codeAltText } from './img.js';
import type { GeneratedFile, NoteCommandContext, NoteCommandSpec } from '../types.js';

const MAX_LINES = 50;
const MAX_FILE_BYTES = 1024 * 1024;

const EXTENSION_LANGUAGES: Record<string, string> = {
	ts: 'ts', tsx: 'tsx', mts: 'ts', cts: 'ts', js: 'js', jsx: 'jsx', mjs: 'js', cjs: 'js', vue: 'vue', svelte: 'svelte',
	py: 'python', rb: 'ruby', rs: 'rust', go: 'go', java: 'java', kt: 'kotlin', kts: 'kotlin', swift: 'swift', scala: 'scala',
	c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php', dart: 'dart', lua: 'lua', zig: 'zig',
	sh: 'bash', bash: 'bash', zsh: 'bash', ps1: 'powershell', sql: 'sql', html: 'html', css: 'css', scss: 'scss',
	json: 'json', jsonc: 'jsonc', yml: 'yaml', yaml: 'yaml', toml: 'toml', xml: 'xml', md: 'markdown', ex: 'elixir', exs: 'elixir',
	hs: 'haskell', ml: 'ocaml', clj: 'clojure', r: 'r', jl: 'julia', nix: 'nix', tf: 'hcl', dockerfile: 'docker',
};

export type CodeReference = { owner: string; repo: string; ref: string | null; path: string; start: number | null; end: number | null };

function parseLineRange(raw: string | undefined): { start: number | null; end: number | null } {
	if (raw == null || raw === '') return { start: null, end: null };
	const numbers = splitList(raw.normalize('NFKC').replace(/^L/i, '').replace(/-L?/i, '|')).map(Number);
	if (numbers.length === 0 || numbers.length > 2 || !numbers.every(number => Number.isInteger(number) && number > 0)) {
		throw new NoteCommandError('行は lines:10|20 のように「開始|終了」で指定してください');
	}
	const [start, end = start] = numbers;
	if (end < start) throw new NoteCommandError('終了行が開始行より前になっています');
	return { start, end };
}

/**
 * Accepts a GitHub blob URL (`https://github.com/o/r/blob/<ref>/<path>#L10-L20`)
 * or the short form `owner/repo path` with `ref:` and `lines:` options.
 * In a URL, the ref is taken as the first path segment after `blob/`; refs containing `/` are not supported there.
 */
export function parseCodeReference(main: string, options: ReadonlyMap<string, string>): CodeReference {
	const url = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/blob\/([^/\s]+)\/([^#\s?]+)(?:\?[^#\s]*)?(?:#(L\d+(?:-L?\d+)?))?$/.exec(main.trim());
	if (url != null) {
		const lines = parseLineRange(options.get('lines') ?? url[5]);
		return { owner: url[1], repo: url[2], ref: url[3], path: decodeURIComponent(url[4]), ...lines };
	}
	const short = /^([\w.-]+)\/([\w.-]+)\s+(\S+)$/.exec(main.trim());
	if (short == null) throw new NoteCommandError('GitHub のファイルの URL か、「owner/repo ファイルのパス」で指定してください');
	return { owner: short[1], repo: short[2], ref: options.get('ref') ?? null, path: short[3].replace(/^\//, ''), ...parseLineRange(options.get('lines')) };
}

/** Pins a branch or tag to the commit it points at now, so the link keeps showing the quoted lines. */
async function resolveCommit(ctx: NoteCommandContext, owner: string, repo: string, ref: string | null): Promise<string> {
	if (ref != null && /^[0-9a-f]{40}$/i.test(ref)) return ref;
	const commitish = ref ?? 'HEAD';
	return await cached(`commit:${owner}/${repo}@${commitish}`, async () => {
		const sha = (await fetchText(ctx, `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(commitish)}`, 'リポジトリかブランチ', {
			headers: { Accept: 'application/vnd.github.sha', ...githubHeaders() },
		})).trim();
		if (!/^[0-9a-f]{40}$/.test(sha)) throw new NoteCommandError('コミットを特定できませんでした');
		return sha;
	});
}

export function languageOf(path: string): string | null {
	const name = path.split('/').at(-1)!.toLowerCase();
	if (name === 'dockerfile') return 'docker';
	return EXTENSION_LANGUAGES[name.split('.').at(-1) ?? ''] ?? null;
}

export const code: NoteCommandSpec = {
	name: 'code',
	main: 'rest',
	options: ['lines', 'ref', 'img'],
	async run(input, ctx) {
		const reference = parseCodeReference(requireMain(input, '%%code https://github.com/owner/repo/blob/main/src/a.ts#L10-L20%%'), input.options);
		const sha = await resolveCommit(ctx, reference.owner, reference.repo, reference.ref);
		const encodedPath = reference.path.split('/').map(encodeURIComponent).join('/');
		const source = await fetchText(ctx, `https://raw.githubusercontent.com/${reference.owner}/${reference.repo}/${sha}/${encodedPath}`, 'ファイル', { maxBytes: MAX_FILE_BYTES });

		const allLines = source.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
		const start = reference.start ?? 1;
		const end = reference.end ?? allLines.length;
		if (start > allLines.length) throw new NoteCommandError(`ファイルは ${allLines.length} 行しかありません`);
		if (end - start + 1 > MAX_LINES) throw new NoteCommandError(`引用できるのは ${MAX_LINES} 行までです。lines:10|20 のように範囲を指定してください`);
		const quoted = allLines.slice(start - 1, end).join('\n');

		const language = languageOf(reference.path);
		const anchor = reference.start == null ? '' : start === end ? `#L${start}` : `#L${start}-L${end}`;
		const link = `https://github.com/${reference.owner}/${reference.repo}/blob/${sha}/${encodedPath}${anchor}`;
		// A fence inside the quoted code would end the block early, so use a longer fence.
		const fence = '`'.repeat(Math.max(3, ...Array.from(quoted.matchAll(/`{3,}/g), match => match[0].length + 1)));

		const files: GeneratedFile[] = [];
		if (flagOption(input, 'img')) {
			const pages = await renderCodeSvgs(quoted, language, 'light', start);
			for (const [i, svg] of pages.entries()) files.push(await svgToFile(svg, 'code.png', codeAltText(language, quoted, i + 1, pages.length)));
		}
		return { text: `${fence}${language ?? ''}\n${quoted}\n${fence}\n${link}`, files };
	},
};
