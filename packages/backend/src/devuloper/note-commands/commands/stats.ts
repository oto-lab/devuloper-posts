/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { axisChart } from '../render/chart.js';
import { PALETTE, SANS, escapeXml, estimateTextWidth, fitText, svgToFile, textWithEmoji } from '../render/svg.js';
import { NoteCommandError } from '../types.js';
import { zonedTimeToTimestamp } from './time.js';
import type { NoteCommandContext, NoteCommandSpec } from '../types.js';

const MAX_DAYS = 366;
const MAX_NOTES_SCANNED = 20000;
const DAY_MS = 86400000;

type LocalDate = { year: number; month: number; day: number };

export type StatsRange = { label: string; start: LocalDate; days: number };

function addDays(date: LocalDate, days: number): LocalDate {
	const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day) + days * DAY_MS);
	return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function daysBetween(from: LocalDate, to: LocalDate): number {
	return Math.round((Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) / DAY_MS);
}

function localDateOf(timestamp: number, zone: string): LocalDate & { hour: number } {
	const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric' }).formatToParts(timestamp);
	const get = (type: string) => Number(parts.find(part => part.type === type)!.value);
	return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') };
}

/** Resolves a range word or a day count against `today` in the poster's calendar. */
export function resolveRange(word: string | null, today: LocalDate, weekStart: 'mon' | 'sun'): StatsRange {
	const key = (word ?? 'week').normalize('NFKC').toLowerCase();
	const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
	const thisWeek = addDays(today, -((weekday - (weekStart === 'mon' ? 1 : 0) + 7) % 7));
	const thisMonth = { ...today, day: 1 };
	const lastMonth = today.month === 1 ? { year: today.year - 1, month: 12, day: 1 } : { year: today.year, month: today.month - 1, day: 1 };

	switch (key) {
		case 'today': return { label: '今日', start: today, days: 1 };
		case 'yesterday': return { label: '昨日', start: addDays(today, -1), days: 1 };
		case 'week': return { label: '今週', start: thisWeek, days: 7 };
		case 'lastweek': return { label: '先週', start: addDays(thisWeek, -7), days: 7 };
		case 'month': return { label: '今月', start: thisMonth, days: daysBetween(thisMonth, today.month === 12 ? { year: today.year + 1, month: 1, day: 1 } : { year: today.year, month: today.month + 1, day: 1 }) };
		case 'lastmonth': return { label: '先月', start: lastMonth, days: daysBetween(lastMonth, thisMonth) };
		case 'year': return { label: '今年', start: { year: today.year, month: 1, day: 1 }, days: daysBetween({ year: today.year, month: 1, day: 1 }, { year: today.year + 1, month: 1, day: 1 }) };
		case 'lastyear': return { label: '昨年', start: { year: today.year - 1, month: 1, day: 1 }, days: daysBetween({ year: today.year - 1, month: 1, day: 1 }, { year: today.year, month: 1, day: 1 }) };
	}
	const days = Number(key);
	if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
		throw new NoteCommandError(`期間は today、yesterday、week、lastweek、month、lastmonth、year、lastyear か、1 から ${MAX_DAYS} までの日数で指定してください`);
	}
	return { label: `直近${days}日`, start: addDays(today, -(days - 1)), days };
}

type Stats = {
	notes: number;
	replies: number;
	renotes: number;
	reactionsReceived: number;
	reactionsGiven: number;
	topReactions: { reaction: string; count: number }[];
	busiestHour: number | null;
	buckets: { label: string; count: number }[];
	truncated: boolean;
};

async function collectStats(ctx: NoteCommandContext, range: StatsRange, zone: string): Promise<Stats> {
	const { idService, notesRepository, noteReactionsRepository } = ctx.services;
	const startTime = zonedTimeToTimestamp({ ...range.start, hour: 0, minute: 0 }, zone);
	const endTime = zonedTimeToTimestamp({ ...addDays(range.start, range.days), hour: 0, minute: 0 }, zone);
	if (startTime > ctx.now.getTime()) throw new NoteCommandError('まだ始まっていない期間です');
	const fromId = idService.gen(startTime);
	const toId = idService.gen(Math.min(endTime, ctx.now.getTime()));

	const notes: { id: string; replyId: string | null; renoteId: string | null; hasText: boolean }[] = await notesRepository.createQueryBuilder('note')
		.select('note.id', 'id')
		.addSelect('note.replyId', 'replyId')
		.addSelect('note.renoteId', 'renoteId')
		.addSelect('(note.text IS NOT NULL OR note.fileIds <> \'{}\' OR note.hasPoll)', 'hasText')
		.where('note.userId = :userId', { userId: ctx.user.id })
		.andWhere('note.id >= :fromId AND note.id < :toId', { fromId, toId })
		.orderBy('note.id', 'DESC')
		.limit(MAX_NOTES_SCANNED)
		.getRawMany();

	const reactionsReceived = await noteReactionsRepository.createQueryBuilder('reaction')
		.innerJoin('reaction.note', 'note')
		.where('note.userId = :userId', { userId: ctx.user.id })
		.andWhere('reaction.id >= :fromId AND reaction.id < :toId', { fromId, toId })
		.getCount();

	const given: { reaction: string; count: string }[] = await noteReactionsRepository.createQueryBuilder('reaction')
		.select('reaction.reaction', 'reaction')
		.addSelect('COUNT(*)', 'count')
		.where('reaction.userId = :userId', { userId: ctx.user.id })
		.andWhere('reaction.id >= :fromId AND reaction.id < :toId', { fromId, toId })
		.groupBy('reaction.reaction')
		.orderBy('count', 'DESC')
		.getRawMany();

	// A pure renote has no content of its own; a quote counts as a note.
	const pureRenotes = notes.filter(note => note.renoteId != null && !note.hasText);
	const hours = new Array<number>(24).fill(0);
	const byMonth = range.days > 62;
	const last = addDays(range.start, range.days - 1);
	const monthCount = (last.year - range.start.year) * 12 + last.month - range.start.month + 1;
	const buckets = new Array<number>(byMonth ? monthCount : range.days).fill(0);
	const bucketLabels = byMonth
		? Array.from({ length: buckets.length }, (_, i) => `${((range.start.month - 1 + i) % 12) + 1}月`)
		: Array.from({ length: range.days }, (_, i) => { const date = addDays(range.start, i); return `${date.month}/${date.day}`; });

	for (const note of notes) {
		const local = localDateOf(idService.parse(note.id).date.getTime(), zone);
		hours[local.hour]++;
		const index = byMonth
			? (local.year - range.start.year) * 12 + local.month - range.start.month
			: daysBetween(range.start, local);
		if (index >= 0 && index < buckets.length) buckets[index]++;
	}
	const busiest = Math.max(...hours);

	return {
		notes: notes.length - pureRenotes.length,
		replies: notes.filter(note => note.replyId != null).length,
		renotes: pureRenotes.length,
		reactionsReceived,
		reactionsGiven: given.reduce((sum, row) => sum + Number(row.count), 0),
		topReactions: given.slice(0, 5).map(row => ({ reaction: row.reaction, count: Number(row.count) })),
		busiestHour: busiest > 0 ? hours.indexOf(busiest) : null,
		buckets: buckets.map((count, i) => ({ label: bucketLabels[i], count })),
		truncated: notes.length >= MAX_NOTES_SCANNED,
	};
}

function formatDate(date: LocalDate): string {
	return `${date.year}/${date.month}/${date.day}`;
}

function periodText(range: StatsRange): string {
	const end = addDays(range.start, range.days - 1);
	return range.days === 1 ? formatDate(range.start) : `${formatDate(range.start)}〜${formatDate(end)}`;
}

/** Custom emoji reactions are stored as `:name@host:`; only the name is shown. */
function reactionLabel(reaction: string): string {
	const custom = /^:([\w+-]+)(?:@[\w.-]+)?:$/.exec(reaction);
	return custom ? `:${custom[1]}:` : reaction;
}

function renderStatsSvg(ctx: NoteCommandContext, range: StatsRange, stats: Stats): string {
	const width = 1200;
	const height = 630;
	const rootDir = ctx.services.config.rootDir;
	const parts: string[] = [`<rect width="${width}" height="${height}" fill="${PALETTE.background}"/>`];
	parts.push(`<text x="48" y="78" font-size="40" font-weight="bold" fill="${PALETTE.text}">${escapeXml(fitText(`@${ctx.user.username} の${range.label}`, 40, 700))}</text>`);
	parts.push(`<text x="${width - 48}" y="78" font-size="24" fill="${PALETTE.muted}" text-anchor="end">${escapeXml(periodText(range))}</text>`);

	const tiles: [string, string][] = [
		['ノート', String(stats.notes)],
		['返信', String(stats.replies)],
		['リノート', String(stats.renotes)],
		['もらった反応', String(stats.reactionsReceived)],
		['した反応', String(stats.reactionsGiven)],
		['よく動いた時間', stats.busiestHour == null ? '-' : `${stats.busiestHour}時台`],
	];
	const tileWidth = (width - 48 * 2 - 16 * 5) / 6;
	tiles.forEach(([label, value], i) => {
		const x = 48 + i * (tileWidth + 16);
		parts.push(`<rect x="${x}" y="110" width="${tileWidth}" height="120" rx="14" fill="${PALETTE.surface}"/>`);
		parts.push(`<text x="${x + 18}" y="148" font-size="18" fill="${PALETTE.muted}">${escapeXml(fitText(label, 18, tileWidth - 30))}</text>`);
		parts.push(`<text x="${x + 18}" y="206" font-size="44" font-weight="bold" fill="${PALETTE.text}">${escapeXml(value)}</text>`);
	});

	parts.push(`<text x="48" y="282" font-size="22" fill="${PALETTE.muted}">よく使ったリアクション</text>`);
	let cursor = 48 + estimateTextWidth('よく使ったリアクション', 22) + 24;
	if (stats.topReactions.length === 0) parts.push(`<text x="${cursor}" y="282" font-size="22" fill="${PALETTE.muted}">なし</text>`);
	for (const { reaction, count } of stats.topReactions) {
		const label = `${reactionLabel(reaction)} ×${count}`;
		parts.push(textWithEmoji(rootDir, label, cursor, 284, 28, `fill="${PALETTE.text}"`));
		cursor += estimateTextWidth(label, 28) + 30;
	}

	const chart = axisChart({
		kind: 'bar',
		title: null,
		labels: stats.buckets.map(bucket => bucket.label),
		series: [{ name: null, values: stats.buckets.map(bucket => bucket.count) }],
	}, { x: 48, y: 310, width: width - 96, height: 290 });
	parts.push(chart.replaceAll(PALETTE.series[0], PALETTE.accent));

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${SANS}">${parts.join('')}</svg>`;
}

function describeStats(ctx: NoteCommandContext, range: StatsRange, stats: Stats): string {
	return [
		`@${ctx.user.username} の${range.label}の統計 (${periodText(range)})`,
		`ノート ${stats.notes}、返信 ${stats.replies}、リノート ${stats.renotes}`,
		`もらったリアクション ${stats.reactionsReceived}、したリアクション ${stats.reactionsGiven}`,
		`よく使ったリアクション: ${stats.topReactions.map(({ reaction, count }) => `${reactionLabel(reaction)} ${count}`).join('、') || 'なし'}`,
		`よく動いた時間: ${stats.busiestHour == null ? 'なし' : `${stats.busiestHour}時台`}`,
		...(stats.truncated ? [`(ノートは新しい ${MAX_NOTES_SCANNED} 件までを集計)`] : []),
	].join('\n');
}

export const stats: NoteCommandSpec = {
	name: 'stats',
	main: 'word',
	mainKey: 'range',
	async run(input, ctx) {
		const zone = ctx.prefs.timezone;
		const today = localDateOf(ctx.now.getTime(), zone);
		const range = resolveRange(input.main, today, ctx.prefs.weekStart);
		const collected = await collectStats(ctx, range, zone);
		return { text: '', files: [await svgToFile(renderStatsSvg(ctx, range, collected), 'stats.png', describeStats(ctx, range, collected))] };
	},
};
