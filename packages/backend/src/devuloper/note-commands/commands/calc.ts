/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { NoteCommandError, enumOption, intOption, requireMain } from '../types.js';
import type { NoteCommandInput, NoteCommandSpec } from '../types.js';

const MAX_EXPRESSION_LENGTH = 300;
const MAX_DEPTH = 50;

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

const FUNCTIONS: Record<string, { arity: [number, number]; fn: (...args: number[]) => number }> = {
	sqrt: { arity: [1, 1], fn: Math.sqrt },
	cbrt: { arity: [1, 1], fn: Math.cbrt },
	abs: { arity: [1, 1], fn: Math.abs },
	round: { arity: [1, 1], fn: Math.round },
	floor: { arity: [1, 1], fn: Math.floor },
	ceil: { arity: [1, 1], fn: Math.ceil },
	sin: { arity: [1, 1], fn: Math.sin },
	cos: { arity: [1, 1], fn: Math.cos },
	tan: { arity: [1, 1], fn: Math.tan },
	asin: { arity: [1, 1], fn: Math.asin },
	acos: { arity: [1, 1], fn: Math.acos },
	atan: { arity: [1, 1], fn: Math.atan },
	ln: { arity: [1, 1], fn: Math.log },
	log: { arity: [1, 2], fn: (x, base) => base == null ? Math.log10(x) : Math.log(x) / Math.log(base) },
	log2: { arity: [1, 1], fn: Math.log2 },
	exp: { arity: [1, 1], fn: Math.exp },
	min: { arity: [1, 100], fn: Math.min },
	max: { arity: [1, 100], fn: Math.max },
};

type Token = { kind: 'number'; value: number } | { kind: 'name'; value: string } | { kind: 'symbol'; value: string };

function tokenize(source: string): Token[] {
	const normalized = source.normalize('NFKC')
		.replaceAll('×', '*').replaceAll('÷', '/').replaceAll('−', '-').replaceAll('**', '^')
		.replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
	const tokens: Token[] = [];
	const pattern = /\s*(?:(\d+(?:\.\d*)?(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)|([a-z_][a-z0-9_]*)|([-+*/%^(),]))/iy;
	let index = 0;
	while (index < normalized.length) {
		if (/^\s*$/.test(normalized.slice(index))) break;
		pattern.lastIndex = index;
		const match = pattern.exec(normalized);
		if (match == null) throw new NoteCommandError(`式に使えない文字があります: ${normalized.slice(index).trim()[0]}`);
		if (match[1] != null) tokens.push({ kind: 'number', value: Number(match[1]) });
		else if (match[2] != null) tokens.push({ kind: 'name', value: match[2].toLowerCase() });
		else tokens.push({ kind: 'symbol', value: match[3] });
		index = pattern.lastIndex;
	}
	return tokens;
}

/**
 * Evaluates arithmetic with + - * / % ^, parentheses, unary signs, `pi`, `e` and the functions in FUNCTIONS.
 * `^` is right-associative and binds tighter than unary minus, so `-2^2` is -4.
 */
export function evaluateExpression(source: string): number {
	if (source.length > MAX_EXPRESSION_LENGTH) throw new NoteCommandError(`式は ${MAX_EXPRESSION_LENGTH} 文字までです`);
	const tokens = tokenize(source);
	let position = 0;
	let depth = 0;

	const peekSymbol = (): string | null => {
		const token = tokens[position];
		return token?.kind === 'symbol' ? token.value : null;
	};
	const expectSymbol = (symbol: string) => {
		if (peekSymbol() !== symbol) throw new NoteCommandError(`式の形が正しくありません (${symbol} がありません)`);
		position++;
	};

	const parseSum = (): number => {
		let value = parseProduct();
		for (let symbol = peekSymbol(); symbol === '+' || symbol === '-'; symbol = peekSymbol()) {
			position++;
			value = symbol === '+' ? value + parseProduct() : value - parseProduct();
		}
		return value;
	};
	const parseProduct = (): number => {
		let value = parseUnary();
		for (let symbol = peekSymbol(); symbol === '*' || symbol === '/' || symbol === '%'; symbol = peekSymbol()) {
			position++;
			const right = parseUnary();
			value = symbol === '*' ? value * right : symbol === '/' ? value / right : value % right;
		}
		return value;
	};
	const parseUnary = (): number => {
		const symbol = peekSymbol();
		if (symbol === '-' || symbol === '+') {
			position++;
			return symbol === '-' ? -parseUnary() : parseUnary();
		}
		return parsePower();
	};
	const parsePower = (): number => {
		const base = parsePrimary();
		if (peekSymbol() !== '^') return base;
		position++;
		return base ** parseUnary();
	};
	const parsePrimary = (): number => {
		if (++depth > MAX_DEPTH) throw new NoteCommandError('式の入れ子が深すぎます');
		try {
			const token = tokens[position++];
			if (token == null) throw new NoteCommandError('式が途中で終わっています');
			if (token.kind === 'number') return token.value;
			if (token.kind === 'symbol') {
				if (token.value !== '(') throw new NoteCommandError(`式の形が正しくありません (${token.value})`);
				const value = parseSum();
				expectSymbol(')');
				return value;
			}
			if (token.value in CONSTANTS && peekSymbol() !== '(') return CONSTANTS[token.value];
			const fn = Object.hasOwn(FUNCTIONS, token.value) ? FUNCTIONS[token.value] : null;
			if (fn == null) throw new NoteCommandError(`知らない名前です: ${token.value}`);
			expectSymbol('(');
			const args = [parseSum()];
			while (peekSymbol() === ',') {
				position++;
				args.push(parseSum());
			}
			expectSymbol(')');
			if (args.length < fn.arity[0] || args.length > fn.arity[1]) throw new NoteCommandError(`${token.value} の引数の数が違います`);
			return fn.fn(...args);
		} finally {
			depth--;
		}
	};

	if (tokens.length === 0) throw new NoteCommandError('式がありません');
	const result = parseSum();
	if (position < tokens.length) throw new NoteCommandError('式の形が正しくありません');
	if (!Number.isFinite(result)) throw new NoteCommandError('計算結果が数になりません (0 で割った、など)');
	return result;
}

/** Rounds away floating-point noise such as 1320.0000000000002, or to `digits` decimal places when given. */
export function formatResult(value: number, digits: number | null): string {
	const rounded = digits == null ? Number(value.toPrecision(12)) : Number(value.toFixed(digits));
	return String(Object.is(rounded, -0) ? 0 : rounded);
}

export function digitsOption(input: NoteCommandInput): number | null {
	return input.options.has('digits') ? intOption(input, 'digits', { min: 0, max: 10, fallback: 0 }) : null;
}

export const calc: NoteCommandSpec = {
	name: 'calc',
	main: 'rest',
	options: ['result', 'digits'],
	run(input) {
		const expression = requireMain(input, '%%calc 1200*1.1%%').trim();
		const result = formatResult(evaluateExpression(expression), digitsOption(input));
		const resultOnly = enumOption(input, 'result', ['only', 'full'], 'full') === 'only';
		return { text: resultOnly ? result : `${expression} = ${result}` };
	},
};
