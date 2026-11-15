/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describeChart, renderChartSvg } from '../render/chart.js';
import { svgToFile } from '../render/svg.js';
import { NoteCommandError, requireMain, splitList } from '../types.js';
import type { ChartData, ChartKind } from '../render/chart.js';
import type { NoteCommandInput, NoteCommandSpec } from '../types.js';

const MAX_POINTS = 60;
const MAX_SERIES = 5;
const MAX_SLICES = 12;

/** Option values cannot contain spaces in the syntax, so `_` stands for a space in titles and labels. */
function decodeSpaces(value: string): string {
	return value.replaceAll('_', ' ');
}

/**
 * Reads `3|5|2` as one series and `3|5|2/4|1|6` as two; `/` was chosen as the series separator
 * because it is easy to type on phone keyboards.
 */
export function parseChartData(kind: ChartKind, input: NoteCommandInput): ChartData {
	const source = requireMain(input, `%%chart.${kind} 3|5|2|8%%`).normalize('NFKC').replace(/\s/g, '');
	const series = source.split('/').map(part => splitList(part).map(value => {
		const number = Number(value);
		if (!Number.isFinite(number)) throw new NoteCommandError(`数値ではありません: ${value}`);
		return number;
	}));

	if (series.length > MAX_SERIES) throw new NoteCommandError(`系列は ${MAX_SERIES} 個までです`);
	const length = series[0].length;
	if (length === 0) throw new NoteCommandError('値を 3|5|2 のように書いてください');
	if (series.some(values => values.length !== length)) throw new NoteCommandError('系列ごとの値の数をそろえてください');

	if (kind === 'circle') {
		if (series.length > 1) throw new NoteCommandError('円グラフの系列は 1 つだけです');
		if (length > MAX_SLICES) throw new NoteCommandError(`円グラフの項目は ${MAX_SLICES} 個までです`);
		if (series[0].some(value => value < 0) || series[0].every(value => value === 0)) throw new NoteCommandError('円グラフの値は 0 以上で、1 つは 0 より大きくしてください');
	} else if (length > MAX_POINTS) {
		throw new NoteCommandError(`値は ${MAX_POINTS} 個までです`);
	}

	const labels = splitList(input.options.get('labels') ?? '').map(decodeSpaces);
	if (labels.length > length) throw new NoteCommandError('ラベルが値より多くなっています');
	const names = splitList(input.options.get('series') ?? '').map(decodeSpaces);
	const title = input.options.get('title');

	return {
		kind,
		title: title != null && title !== '' ? decodeSpaces(title) : null,
		labels: Array.from({ length }, (_, i) => labels[i] ?? String(i + 1)),
		series: series.map((values, i) => ({ name: names[i] ?? null, values })),
	};
}

function chartCommand(kind: ChartKind): NoteCommandSpec {
	return {
		name: `chart.${kind}`,
		main: 'rest',
		options: ['labels', 'title', 'series'],
		async run(input) {
			const data = parseChartData(kind, input);
			return { text: '', files: [await svgToFile(renderChartSvg(data), `chart-${kind}.png`, describeChart(data))] };
		},
	};
}

export const chartCommands: NoteCommandSpec[] = (['bar', 'line', 'circle'] as const).map(chartCommand);
