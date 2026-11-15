/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PALETTE, SANS, escapeXml, estimateTextWidth, fitText } from './svg.js';

export type ChartKind = 'bar' | 'line' | 'circle';

export type ChartData = {
	kind: ChartKind;
	title: string | null;
	labels: string[];
	series: { name: string | null; values: number[] }[];
};

export type Box = { x: number; y: number; width: number; height: number };

export function formatValue(value: number): string {
	return String(Number(value.toPrecision(6)));
}

function niceStep(rough: number): number {
	const exponent = 10 ** Math.floor(Math.log10(rough));
	const fraction = rough / exponent;
	return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * exponent;
}

/** Axis bounds that include zero and land on round tick values. */
export function niceAxis(values: number[], tickCount = 5): { min: number; max: number; step: number } {
	const low = Math.min(0, ...values);
	const high = Math.max(0, ...values);
	if (low === high) return { min: 0, max: 1, step: 0.2 };
	const step = niceStep((high - low) / tickCount);
	return { min: Math.floor(low / step) * step, max: Math.ceil(high / step) * step, step };
}

function legend(series: ChartData['series'], x: number, y: number, maxWidth: number): string {
	let cursor = x;
	return series.map((item, i) => {
		const label = fitText(item.name ?? `系列${i + 1}`, 22, 220);
		const width = 34 + estimateTextWidth(label, 22) + 24;
		if (cursor + width > x + maxWidth) return '';
		const out = `<rect x="${cursor}" y="${y - 16}" width="22" height="22" rx="4" fill="${PALETTE.series[i % PALETTE.series.length]}"/>`
			+ `<text x="${cursor + 30}" y="${y + 2}" font-size="22" fill="${PALETTE.text}">${escapeXml(label)}</text>`;
		cursor += width;
		return out;
	}).join('');
}

/** Draws a bar or line chart into `box`; returns SVG elements without the outer <svg>. */
export function axisChart(data: ChartData, box: Box): string {
	const { min, max, step } = niceAxis(data.series.flatMap(item => item.values));
	const labelWidth = Math.max(...[min, max].map(value => estimateTextWidth(formatValue(value), 20))) + 16;
	const plot = { x: box.x + labelWidth, y: box.y + 10, width: box.width - labelWidth, height: box.height - 50 };
	const yOf = (value: number) => plot.y + plot.height - (value - min) / (max - min) * plot.height;
	const count = data.labels.length;
	const slot = plot.width / count;

	const parts: string[] = [];
	for (let value = min; value <= max + step / 2; value += step) {
		const y = yOf(value);
		parts.push(`<line x1="${plot.x}" x2="${plot.x + plot.width}" y1="${y}" y2="${y}" stroke="${PALETTE.grid}" stroke-width="${Math.abs(value) < step / 2 ? 2 : 1}"/>`);
		parts.push(`<text x="${plot.x - 10}" y="${y + 7}" font-size="20" fill="${PALETTE.muted}" text-anchor="end">${escapeXml(formatValue(value))}</text>`);
	}

	// Long label lists would overlap, so only every n-th label is printed.
	const labelEvery = Math.max(1, Math.ceil(count / Math.max(1, Math.floor(plot.width / 70))));
	data.labels.forEach((label, i) => {
		if (i % labelEvery !== 0) return;
		const x = plot.x + slot * (i + 0.5);
		parts.push(`<text x="${x}" y="${plot.y + plot.height + 34}" font-size="20" fill="${PALETTE.muted}" text-anchor="middle">${escapeXml(fitText(label, 20, slot * labelEvery - 6))}</text>`);
	});

	if (data.kind === 'bar') {
		const groupWidth = slot * 0.7;
		const barWidth = groupWidth / data.series.length;
		data.series.forEach((item, s) => {
			item.values.forEach((value, i) => {
				const x = plot.x + slot * i + (slot - groupWidth) / 2 + barWidth * s;
				const top = Math.min(yOf(value), yOf(0));
				const height = Math.max(Math.abs(yOf(value) - yOf(0)), 1);
				parts.push(`<rect x="${x}" y="${top}" width="${Math.max(barWidth - 2, 1)}" height="${height}" rx="3" fill="${PALETTE.series[s % PALETTE.series.length]}"/>`);
			});
		});
	} else {
		data.series.forEach((item, s) => {
			const color = PALETTE.series[s % PALETTE.series.length];
			const points = item.values.map((value, i) => `${plot.x + slot * (i + 0.5)},${yOf(value)}`);
			parts.push(`<polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`);
			if (count <= 60) {
				for (const point of points) {
					const [x, y] = point.split(',');
					parts.push(`<circle cx="${x}" cy="${y}" r="6" fill="${PALETTE.background}" stroke="${color}" stroke-width="3"/>`);
				}
			}
		});
	}
	return parts.join('');
}

function circleChart(data: ChartData, box: Box): string {
	const values = data.series[0].values;
	const total = values.reduce((sum, value) => sum + value, 0);
	const radius = Math.min(box.height, box.width * 0.5) / 2 - 10;
	const cx = box.x + radius + 20;
	const cy = box.y + box.height / 2;
	const parts: string[] = [];

	let angle = -Math.PI / 2;
	values.forEach((value, i) => {
		const color = PALETTE.series[i % PALETTE.series.length];
		const sweep = value / total * Math.PI * 2;
		if (sweep >= Math.PI * 2 - 1e-9) {
			parts.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${color}"/>`);
		} else if (sweep > 0) {
			const x1 = cx + radius * Math.cos(angle);
			const y1 = cy + radius * Math.sin(angle);
			const x2 = cx + radius * Math.cos(angle + sweep);
			const y2 = cy + radius * Math.sin(angle + sweep);
			parts.push(`<path d="M${cx},${cy} L${x1},${y1} A${radius},${radius} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2},${y2} Z" fill="${color}" stroke="${PALETTE.background}" stroke-width="3"/>`);
		}
		angle += sweep;
	});

	const legendX = cx + radius + 60;
	const rowHeight = Math.min(48, box.height / values.length);
	const fontSize = Math.min(24, rowHeight * 0.6);
	values.forEach((value, i) => {
		const y = cy - rowHeight * values.length / 2 + rowHeight * (i + 0.5);
		const label = `${data.labels[i] ?? `項目${i + 1}`}  ${formatValue(value)} (${Math.round(value / total * 1000) / 10}%)`;
		parts.push(`<rect x="${legendX}" y="${y - fontSize * 0.75}" width="${fontSize}" height="${fontSize}" rx="4" fill="${PALETTE.series[i % PALETTE.series.length]}"/>`);
		parts.push(`<text x="${legendX + fontSize + 12}" y="${y + fontSize * 0.25}" font-size="${fontSize}" fill="${PALETTE.text}">${escapeXml(fitText(label, fontSize, box.x + box.width - legendX - fontSize - 12))}</text>`);
	});
	return parts.join('');
}

export function renderChartSvg(data: ChartData, width = 1200, height = 675): string {
	const padding = 40;
	let top = padding;
	const parts: string[] = [`<rect width="${width}" height="${height}" fill="${PALETTE.background}"/>`];
	if (data.title != null) {
		parts.push(`<text x="${padding}" y="${top + 34}" font-size="36" font-weight="bold" fill="${PALETTE.text}">${escapeXml(fitText(data.title, 36, width - padding * 2))}</text>`);
		top += 60;
	}
	if (data.kind !== 'circle' && data.series.length > 1) {
		parts.push(legend(data.series, padding, top + 16, width - padding * 2));
		top += 44;
	}
	const box = { x: padding, y: top, width: width - padding * 2, height: height - top - padding };
	parts.push(data.kind === 'circle' ? circleChart(data, box) : axisChart(data, box));
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${SANS}">${parts.join('')}</svg>`;
}

/** Plain-text description for alt text, so the numbers are readable without the image. */
export function describeChart(data: ChartData): string {
	const kindName = { bar: '棒グラフ', line: '折れ線グラフ', circle: '円グラフ' }[data.kind];
	const lines = [`${kindName}${data.title != null ? `: ${data.title}` : ''}`];
	if (data.series.length > 1) lines.push(`系列: ${data.series.map((item, i) => item.name ?? `系列${i + 1}`).join(', ')}`);
	data.labels.forEach((label, i) => {
		lines.push(`${label}: ${data.series.map(item => formatValue(item.values[i])).join(', ')}`);
	});
	return lines.join('\n');
}
