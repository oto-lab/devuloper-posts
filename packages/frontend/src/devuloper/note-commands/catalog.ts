/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Fork-only (oto-lab/devuloper-posts): UI definitions for the server-side `%%command …%%` syntax.
// The server owns the behavior; this file only knows how to write the syntax.

export type CommandField = {
	key: string;
	label: string;
	/** `main` and `text` are written bare; `option` is written as `key:value`. */
	role: 'main' | 'text' | 'option';
	type: 'string' | 'enum' | 'boolean';
	multiline?: boolean;
	required?: boolean;
	description?: string;
	enum?: { label: string; value: string }[];
	default?: string | boolean;
	/** Value written for a checked boolean option; `on` when omitted. */
	onValue?: string;
	/**
	 * Prefilled from the selected text in the post form, which the syntax then replaces.
	 * `orWholeText` takes the whole note when nothing is selected.
	 */
	fromSelection?: boolean | 'orWholeText';
	/** The syntax cannot carry spaces in option values; the server reads `_` as a space for these fields. */
	spacesAsUnderscore?: boolean;
};

export type CommandDef = {
	name: string;
	label: string;
	icon: string;
	group: 'text' | 'random' | 'image';
	fields: CommandField[];
	/** False for commands whose result is decided when the note is posted. */
	preview: boolean;
	description?: string;
};

const FONT_STYLES: { value: string; label: string }[] = [
	{ value: 'bold', label: '𝐁𝐨𝐥𝐝' },
	{ value: 'italic', label: '𝐼𝑡𝑎𝑙𝑖𝑐' },
	{ value: 'bolditalic', label: '𝑩𝒐𝒍𝒅 𝑰𝒕𝒂𝒍𝒊𝒄' },
	{ value: 'script', label: '𝓢𝓬𝓻𝓲𝓹𝓽' },
	{ value: 'fraktur', label: '𝔉𝔯𝔞𝔨𝔱𝔲𝔯' },
	{ value: 'double', label: '𝔻𝕠𝕦𝕓𝕝𝕖' },
	{ value: 'sans', label: '𝖲𝖺𝗇𝗌' },
	{ value: 'mono', label: '𝙼𝚘𝚗𝚘' },
	{ value: 'circle', label: 'Ⓒⓘⓡⓒⓛⓔ' },
	{ value: 'flip', label: 'dılɟ' },
];

export const COMMANDS: CommandDef[] = [
	...FONT_STYLES.map((style): CommandDef => ({
		name: `font.${style.value}`,
		label: `装飾文字: ${style.label}`,
		icon: 'ti ti-typography',
		group: 'text',
		preview: true,
		description: '英数字を Unicode の装飾文字にします。読み上げソフトでは読みにくくなります。',
		fields: [{ key: 'content', label: '文字列', role: 'main', type: 'string', multiline: true, required: true, fromSelection: true }],
	})),
	{
		name: 'banner',
		label: 'アスキーアート',
		icon: 'ti ti-letter-case',
		group: 'text',
		preview: true,
		fields: [
			{ key: 'font', label: 'フォント', role: 'option', type: 'enum', default: 'standard', enum: ['standard', 'slant', 'small', 'big', 'mini', 'shadow'].map(value => ({ label: value, value })) },
			{ key: 'content', label: '文字列 (半角英数字)', role: 'main', type: 'string', required: true, fromSelection: true },
		],
	},
	{
		name: 'progress',
		label: 'プログレスバー',
		icon: 'ti ti-progress',
		group: 'text',
		preview: true,
		fields: [
			{ key: 'value', label: '値', role: 'main', type: 'string', required: true, description: '7|10 (現在値|最大値) か 70 (パーセント)' },
			{ key: 'width', label: '長さ', role: 'option', type: 'string', default: '10' },
			{ key: 'style', label: '見た目', role: 'option', type: 'enum', default: 'block', enum: [
				{ label: '▓░', value: 'block' }, { label: '█░', value: 'bar' }, { label: '●○', value: 'circle' }, { label: '■□', value: 'square' }, { label: '🟩⬜', value: 'emoji' },
			] },
		],
	},
	{
		name: 'calc',
		label: '計算',
		icon: 'ti ti-calculator',
		group: 'text',
		preview: true,
		fields: [
			{ key: 'expression', label: '式', role: 'main', type: 'string', required: true, fromSelection: true, description: '+ - * / % ^、括弧、sqrt や log などの関数' },
			{ key: 'result', label: '結果だけにする', role: 'option', type: 'boolean', default: false, onValue: 'only' },
			{ key: 'digits', label: '小数の桁数 (空欄で自動)', role: 'option', type: 'string' },
		],
	},
	{
		name: 'unit',
		label: '単位変換',
		icon: 'ti ti-ruler-measure',
		group: 'text',
		preview: true,
		fields: [
			{ key: 'value', label: '値と単位', role: 'main', type: 'string', required: true, description: '例: 5mi、100F、1GiB' },
			{ key: 'to', label: '変換先', role: 'option', type: 'string', required: true, description: '例: km、km|m' },
			{ key: 'digits', label: '小数の桁数', role: 'option', type: 'string' },
		],
	},
	{
		name: 'time',
		label: '時刻をタイムゾーンで並べる',
		icon: 'ti ti-world-pin',
		group: 'text',
		preview: true,
		fields: [
			{ key: 'value', label: '日時', role: 'main', type: 'string', required: true, default: 'now', description: '例: 21:00、12/24 21:00、now' },
			{ key: 'zones', label: 'タイムゾーン (空欄で設定の既定値)', role: 'option', type: 'string', description: '例: utc|pst|Europe/Paris' },
		],
	},
	{
		name: 'qr',
		label: 'QR コード',
		icon: 'ti ti-qrcode',
		group: 'image',
		preview: true,
		fields: [
			{ key: 'content', label: '中身 (URL や文章)', role: 'main', type: 'string', multiline: true, required: true, fromSelection: true },
			{ key: 'hide', label: '中身を本文から隠す', role: 'option', type: 'boolean', default: false },
			{ key: 'size', label: '画像の大きさ (px)', role: 'option', type: 'string', default: '512' },
			{ key: 'ecc', label: '誤り訂正', role: 'option', type: 'enum', default: 'm', enum: [
				{ label: 'L (7%)', value: 'l' }, { label: 'M (15%)', value: 'm' }, { label: 'Q (25%)', value: 'q' }, { label: 'H (30%)', value: 'h' },
			] },
		],
	},
	...(['bar', 'line', 'circle'] as const).map((kind): CommandDef => ({
		name: `chart.${kind}`,
		label: { bar: '棒グラフ', line: '折れ線グラフ', circle: '円グラフ' }[kind],
		icon: { bar: 'ti ti-chart-bar', line: 'ti ti-chart-line', circle: 'ti ti-chart-pie' }[kind],
		group: 'image',
		preview: true,
		fields: [
			{ key: 'values', label: '値 (| 区切り)', role: 'main', type: 'string', required: true, description: kind === 'circle' ? '例: 3|5|2' : '例: 3|5|2|8。系列を増やすときは / で区切る (3|5/4|1)' },
			{ key: 'labels', label: 'ラベル (| 区切り)', role: 'option', type: 'string', spacesAsUnderscore: true },
			{ key: 'title', label: 'タイトル', role: 'option', type: 'string', spacesAsUnderscore: true },
			...(kind === 'circle' ? [] : [{ key: 'series', label: '系列の名前 (| 区切り)', role: 'option', type: 'string', spacesAsUnderscore: true } satisfies CommandField]),
		],
	})),
	{
		name: 'img',
		label: 'コードと数式を画像にする',
		icon: 'ti ti-photo-code',
		group: 'image',
		preview: true,
		description: '``` のコードブロックと \\( \\) / \\[ \\] の数式を画像にして添付します。本文はそのまま残ります。',
		fields: [
			{ key: 'content', label: '対象 (選択していなければノート全体)', role: 'main', type: 'string', multiline: true, required: true, fromSelection: 'orWholeText' },
			{ key: 'theme', label: 'テーマ', role: 'option', type: 'enum', default: 'light', enum: [{ label: 'ライト', value: 'light' }, { label: 'ダーク', value: 'dark' }] },
		],
	},
	{
		name: 'stats',
		label: '統計カード',
		icon: 'ti ti-report-analytics',
		group: 'image',
		preview: true,
		fields: [
			{ key: 'range', label: '期間', role: 'main', type: 'enum', default: 'week', enum: [
				{ label: '今日', value: 'today' }, { label: '昨日', value: 'yesterday' }, { label: '今週', value: 'week' }, { label: '先週', value: 'lastweek' },
				{ label: '今月', value: 'month' }, { label: '先月', value: 'lastmonth' }, { label: '今年', value: 'year' }, { label: '昨年', value: 'lastyear' },
				{ label: '直近7日', value: '7' }, { label: '直近30日', value: '30' }, { label: '直近90日', value: '90' },
			] },
		],
	},
	{
		name: 'rand.dice',
		label: 'サイコロ',
		icon: 'ti ti-dice-5',
		group: 'random',
		preview: false,
		fields: [{ key: 'notation', label: '個数d面数', role: 'main', type: 'string', default: '2d6' }],
	},
	{
		name: 'rand.choose',
		label: 'ランダムに選ぶ',
		icon: 'ti ti-arrows-shuffle',
		group: 'random',
		preview: false,
		fields: [
			{ key: 'choices', label: '選択肢 (| 区切り)', role: 'main', type: 'string', required: true, fromSelection: true },
			{ key: 'count', label: '選ぶ数', role: 'option', type: 'string' },
		],
	},
	{
		name: 'rand.num',
		label: '範囲内の整数',
		icon: 'ti ti-number',
		group: 'random',
		preview: false,
		fields: [{ key: 'range', label: '最小|最大', role: 'main', type: 'string', default: '1|100' }],
	},
	{
		name: 'rand.omikuji',
		label: 'おみくじ',
		icon: 'ti ti-torii',
		group: 'random',
		preview: false,
		fields: [],
	},
];

function escapePercent(value: string): string {
	return value.replace(/[%％]/g, match => `\\${match}`);
}

/**
 * Writes the syntax for `def` from form values.
 * Option values cannot contain spaces in the syntax, so whitespace in them is removed.
 *
 * @example
 * buildSyntax(dice, { notation: '2d6' }) // => '%%rand.dice 2d6%%'
 */
export function buildSyntax(def: CommandDef, values: Record<string, unknown>): string {
	const parts: string[] = [def.name];
	for (const field of def.fields.filter(candidate => candidate.role === 'option')) {
		const value = values[field.key];
		if (field.type === 'boolean') {
			if (value === true) parts.push(`${field.key}:${field.onValue ?? 'on'}`);
			continue;
		}
		const text = typeof value === 'string' ? value.trim().replace(/\s*\|\s*/g, '|').replace(/\s+/g, field.spacesAsUnderscore ? '_' : '') : '';
		if (text !== '' && text !== field.default) parts.push(`${field.key}:${escapePercent(text)}`);
	}
	for (const role of ['main', 'text'] as const) {
		for (const field of def.fields.filter(candidate => candidate.role === role)) {
			const value = values[field.key];
			if (typeof value === 'string' && value.trim() !== '') parts.push(escapePercent(value.trim()));
		}
	}
	return `%%${parts.join(' ')}%%`;
}
