/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { NoteCommandError, requireMain, splitList } from '../types.js';
import { digitsOption, formatResult } from './calc.js';
import type { NoteCommandSpec } from '../types.js';

type Unit = {
	symbol: string;
	dimension: string;
	/** Converts a value in this unit to the dimension's base unit. */
	toBase: (value: number) => number;
	fromBase: (value: number) => number;
};

function linear(symbol: string, dimension: string, factor: number): Unit {
	return { symbol, dimension, toBase: value => value * factor, fromBase: value => value / factor };
}

const UNIT_LIST: [string[], Unit][] = [
	[['mm'], linear('mm', 'length', 0.001)],
	[['cm'], linear('cm', 'length', 0.01)],
	[['m', 'meter', 'meters', 'metre'], linear('m', 'length', 1)],
	[['km'], linear('km', 'length', 1000)],
	[['in', 'inch', 'inches', '"'], linear('in', 'length', 0.0254)],
	[['ft', 'foot', 'feet', '\''], linear('ft', 'length', 0.3048)],
	[['yd', 'yard', 'yards'], linear('yd', 'length', 0.9144)],
	[['mi', 'mile', 'miles'], linear('mi', 'length', 1609.344)],
	[['nmi'], linear('nmi', 'length', 1852)],
	[['尺'], linear('尺', 'length', 10 / 33)],

	[['mg'], linear('mg', 'mass', 0.001)],
	[['g', 'gram', 'grams'], linear('g', 'mass', 1)],
	[['kg'], linear('kg', 'mass', 1000)],
	[['t', 'ton', 'tonne'], linear('t', 'mass', 1e6)],
	[['oz', 'ounce', 'ounces'], linear('oz', 'mass', 28.349523125)],
	[['lb', 'lbs', 'pound', 'pounds'], linear('lb', 'mass', 453.59237)],

	[['c', '°c', '℃', 'degc', 'celsius'], { symbol: '°C', dimension: 'temperature', toBase: v => v, fromBase: v => v }],
	[['f', '°f', '℉', 'degf', 'fahrenheit'], { symbol: '°F', dimension: 'temperature', toBase: v => (v - 32) * 5 / 9, fromBase: v => v * 9 / 5 + 32 }],
	[['k', 'kelvin'], { symbol: 'K', dimension: 'temperature', toBase: v => v - 273.15, fromBase: v => v + 273.15 }],

	[['b', 'bit', 'bits'], linear('bit', 'data', 1 / 8)],
	[['Kb', 'kbit'], linear('kbit', 'data', 1e3 / 8)],
	[['Mb', 'mbit'], linear('Mbit', 'data', 1e6 / 8)],
	[['Gb', 'gbit'], linear('Gbit', 'data', 1e9 / 8)],
	[['B', 'byte', 'bytes'], linear('B', 'data', 1)],
	[['KB', 'kb'], linear('KB', 'data', 1e3)],
	[['MB', 'mb'], linear('MB', 'data', 1e6)],
	[['GB', 'gb'], linear('GB', 'data', 1e9)],
	[['TB', 'tb'], linear('TB', 'data', 1e12)],
	[['PB', 'pb'], linear('PB', 'data', 1e15)],
	[['KiB', 'kib'], linear('KiB', 'data', 2 ** 10)],
	[['MiB', 'mib'], linear('MiB', 'data', 2 ** 20)],
	[['GiB', 'gib'], linear('GiB', 'data', 2 ** 30)],
	[['TiB', 'tib'], linear('TiB', 'data', 2 ** 40)],

	[['ms'], linear('ms', 'time', 0.001)],
	[['s', 'sec', 'second', 'seconds', '秒'], linear('s', 'time', 1)],
	[['min', 'minute', 'minutes', '分'], linear('min', 'time', 60)],
	[['h', 'hr', 'hour', 'hours', '時間'], linear('h', 'time', 3600)],
	[['d', 'day', 'days', '日'], linear('d', 'time', 86400)],
	[['wk', 'week', 'weeks', '週'], linear('wk', 'time', 604800)],
	[['y', 'yr', 'year', 'years', '年'], linear('y', 'time', 31557600)],

	[['ml', 'mL'], linear('mL', 'volume', 0.001)],
	[['l', 'L', 'liter', 'litre'], linear('L', 'volume', 1)],
	[['gal', 'gallon', 'gallons'], linear('gal', 'volume', 3.785411784)],
	[['floz'], linear('fl oz', 'volume', 0.0295735295625)],
	[['cup', 'cups'], linear('cup', 'volume', 0.2365882365)],
	[['合'], linear('合', 'volume', 0.18039)],

	[['m/s', 'mps'], linear('m/s', 'speed', 1)],
	[['km/h', 'kmh', 'kph'], linear('km/h', 'speed', 1 / 3.6)],
	[['mph'], linear('mph', 'speed', 0.44704)],
	[['kn', 'kt', 'knot', 'knots'], linear('kn', 'speed', 1852 / 3600)],

	[['m2', 'm²', 'sqm'], linear('m²', 'area', 1)],
	[['km2', 'km²'], linear('km²', 'area', 1e6)],
	[['ha'], linear('ha', 'area', 1e4)],
	[['acre', 'acres'], linear('acre', 'area', 4046.8564224)],
	[['ft2', 'ft²', 'sqft'], linear('ft²', 'area', 0.09290304)],
	[['坪', 'tsubo'], linear('坪', 'area', 400 / 121)],
];

const EXACT = new Map<string, Unit>();
const CASE_INSENSITIVE = new Map<string, Unit>();
for (const [names, unit] of UNIT_LIST) {
	for (const name of names) {
		EXACT.set(name, unit);
		// `b` (bit) and `B` (byte) differ only by case, so neither is matched loosely.
		if (name.toLowerCase() !== 'b') CASE_INSENSITIVE.set(name.toLowerCase(), unit);
	}
}

export function findUnit(name: string): Unit {
	const normalized = name.normalize('NFKC').trim();
	const unit = EXACT.get(normalized) ?? CASE_INSENSITIVE.get(normalized.toLowerCase());
	if (unit == null) throw new NoteCommandError(`知らない単位です: ${name}`);
	return unit;
}

export const unit: NoteCommandSpec = {
	name: 'unit',
	main: 'rest',
	options: ['to', 'digits'],
	run(input) {
		const source = requireMain(input, '%%unit to:km 5mi%%').normalize('NFKC').trim();
		const match = /^([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?)\s*(.+)$/i.exec(source);
		if (match == null) throw new NoteCommandError('値は 5mi のように「数値 単位」で書いてください');
		const value = Number(match[1]);
		const from = findUnit(match[2]);

		const targets = splitList(input.options.get('to') ?? '').map(findUnit);
		if (targets.length === 0) throw new NoteCommandError('変換先の単位を to:km のように指定してください');
		const digits = digitsOption(input) ?? 2;

		const base = from.toBase(value);
		const converted = targets.map(target => {
			if (target.dimension !== from.dimension) throw new NoteCommandError(`${from.symbol} は ${target.symbol} に変換できません`);
			const result = target.fromBase(base);
			// Keep three significant digits when rounding to `digits` places would print 0.
			const tooSmallForDigits = result !== 0 && Math.abs(result) < 10 ** -digits;
			return `${tooSmallForDigits ? String(Number(result.toPrecision(3))) : formatResult(result, digits)} ${target.symbol}`;
		});
		return { text: [`${formatResult(value, null)} ${from.symbol}`, ...converted].join(' = ') };
	},
};
