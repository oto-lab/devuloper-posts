/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type CommandOccurrence = {
	start: number;
	end: number;
	name: string;
	body: string;
};

export type ParsedArgs = {
	options: Map<string, string>;
	/** Everything after the options, with leading whitespace removed. */
	rest: string;
};

const PERCENT = new Set(['%', '％']);
const WHITESPACE = /[\s\u3000]/;
const COMMAND_NAME = /^[A-Za-zＡ-Ｚａ-ｚ][A-Za-z0-9Ａ-Ｚａ-ｚ０-９]*(?:[.．][A-Za-zＡ-Ｚａ-ｚ][A-Za-z0-9Ａ-Ｚａ-ｚ０-９]*)?/;
const OPTION = /^([A-Za-zＡ-Ｚａ-ｚ]+)[:：]([\s\S]*)$/;

function isDelimiterAt(text: string, i: number): boolean {
	return PERCENT.has(text[i]) && PERCENT.has(text[i + 1]);
}

/** Returns the index just past a code span or fenced block starting at `i`, or null when `i` does not open one. */
function skipCode(text: string, i: number): number | null {
	if (text.startsWith('```', i)) {
		const close = text.indexOf('```', i + 3);
		return close === -1 ? text.length : close + 3;
	}
	if (text[i] === '`') {
		const close = text.indexOf('`', i + 1);
		const newline = text.indexOf('\n', i + 1);
		// An unmatched backtick on its line is a literal character, as in MFM.
		if (close === -1 || (newline !== -1 && newline < close)) return null;
		return close + 1;
	}
	return null;
}

export function normalizeCommandName(raw: string): string {
	return raw.normalize('NFKC').toLowerCase();
}

/**
 * Finds `%%name ...%%` occurrences whose name passes `isKnownName`, skipping code blocks and inline code.
 * Full-width `％` counts as `%`. Inside the body, `\%` stands for a literal `%`
 * so that `%%` can be written without closing the command.
 *
 * @example
 * findCommands('a %%rand.dice 2d6%% b', name => name.startsWith('rand'))
 * // => [{ start: 2, end: 19, name: 'rand.dice', body: '2d6' }]
 */
export function findCommands(text: string, isKnownName: (name: string) => boolean): CommandOccurrence[] {
	const found: CommandOccurrence[] = [];
	let i = 0;
	while (i < text.length) {
		const codeEnd = skipCode(text, i);
		if (codeEnd != null) {
			i = codeEnd;
			continue;
		}
		if (!isDelimiterAt(text, i)) {
			i++;
			continue;
		}

		const nameMatch = COMMAND_NAME.exec(text.slice(i + 2, i + 2 + 64));
		const name = nameMatch ? normalizeCommandName(nameMatch[0]) : null;
		const afterName = i + 2 + (nameMatch?.[0].length ?? 0);
		const separatedFromBody = afterName < text.length && (WHITESPACE.test(text[afterName]) || isDelimiterAt(text, afterName));
		if (name == null || !separatedFromBody || !isKnownName(name)) {
			i += 2;
			continue;
		}

		const closing = scanBody(text, afterName);
		if (closing == null) {
			i += 2;
			continue;
		}
		found.push({ start: i, end: closing.end, name, body: closing.body.replace(/^[\s\u3000]+|[\s\u3000]+$/g, '') });
		i = closing.end;
	}
	return found;
}

function scanBody(text: string, from: number): { body: string; end: number } | null {
	let body = '';
	let i = from;
	while (i < text.length) {
		if (text[i] === '\\' && PERCENT.has(text[i + 1])) {
			body += '%';
			i += 2;
			continue;
		}
		const codeEnd = skipCode(text, i);
		if (codeEnd != null) {
			body += text.slice(i, codeEnd);
			i = codeEnd;
			continue;
		}
		if (isDelimiterAt(text, i)) return { body, end: i + 2 };
		body += text[i];
		i++;
	}
	return null;
}

/**
 * Reads leading `key:value` words whose key is in `optionKeys`; the first other word starts `rest`.
 * Keys are matched case-insensitively and full-width `：` and `｜` are accepted.
 * A word like `https://…` or `21:00` stays in `rest` because its key is not a known option.
 */
export function parseArgs(body: string, optionKeys: ReadonlySet<string>): ParsedArgs {
	const options = new Map<string, string>();
	let i = 0;
	for (;;) {
		while (i < body.length && WHITESPACE.test(body[i])) i++;
		let wordEnd = i;
		while (wordEnd < body.length && !WHITESPACE.test(body[wordEnd])) wordEnd++;
		const match = OPTION.exec(body.slice(i, wordEnd));
		const key = match ? match[1].normalize('NFKC').toLowerCase() : null;
		if (match == null || key == null || !optionKeys.has(key)) break;
		options.set(key, normalizeValue(match[2]));
		i = wordEnd;
	}
	return { options, rest: body.slice(i) };
}

export function normalizeValue(value: string): string {
	return value.replaceAll('｜', '|');
}

/** Splits `rest` into its first word and the remaining text. */
export function splitFirstWord(rest: string): { word: string | null; remainder: string } {
	const trimmed = rest.replace(/^[\s\u3000]+/, '');
	if (trimmed === '') return { word: null, remainder: '' };
	const match = /[\s\u3000]/.exec(trimmed);
	if (match == null) return { word: normalizeValue(trimmed), remainder: '' };
	return {
		word: normalizeValue(trimmed.slice(0, match.index)),
		remainder: trimmed.slice(match.index).replace(/^[\s\u3000]+/, ''),
	};
}
