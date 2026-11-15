/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isValidTimeZone } from '../prefs.js';
import { NoteCommandError, splitList } from '../types.js';
import type { NoteCommandSpec } from '../types.js';

const ZONE_ALIASES: Record<string, string> = {
	utc: 'UTC', gmt: 'UTC', z: 'UTC',
	jst: 'Asia/Tokyo', kst: 'Asia/Seoul', hkt: 'Asia/Hong_Kong', sgt: 'Asia/Singapore', ist: 'Asia/Kolkata',
	pt: 'America/Los_Angeles', pst: 'America/Los_Angeles', pdt: 'America/Los_Angeles',
	mt: 'America/Denver', mst: 'America/Denver', mdt: 'America/Denver',
	ct: 'America/Chicago', cst: 'America/Chicago', cdt: 'America/Chicago',
	et: 'America/New_York', est: 'America/New_York', edt: 'America/New_York',
	uk: 'Europe/London', bst: 'Europe/London',
	cet: 'Europe/Paris', cest: 'Europe/Paris',
	aest: 'Australia/Sydney', aedt: 'Australia/Sydney',
};

/** Abbreviations that `Intl` prints only as `GMT+9` and the like. */
const FIXED_LABELS: Record<string, string> = {
	'Asia/Tokyo': 'JST',
	'Asia/Seoul': 'KST',
	'Asia/Hong_Kong': 'HKT',
	'Asia/Singapore': 'SGT',
	'Asia/Kolkata': 'IST',
};

export function resolveZone(name: string): string {
	const trimmed = name.normalize('NFKC').trim();
	const zone = ZONE_ALIASES[trimmed.toLowerCase()] ?? trimmed;
	if (!isValidTimeZone(zone)) throw new NoteCommandError(`知らないタイムゾーンです: ${name}`);
	return new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone;
}

const DAY_MS = 86400000;

type WallTime = { year: number; month: number; day: number; hour: number; minute: number };

function wallTimeIn(zone: string, timestamp: number): WallTime {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: zone, hourCycle: 'h23',
		year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
	}).formatToParts(timestamp);
	const get = (type: string) => Number(parts.find(part => part.type === type)!.value);
	return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

function offsetOf(zone: string, timestamp: number): number {
	const wall = wallTimeIn(zone, timestamp);
	const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
	return asUtc - Math.floor(timestamp / 60000) * 60000;
}

/**
 * Converts a wall-clock time in `zone` to a timestamp.
 * A time skipped by a DST jump resolves to the moment after the jump;
 * a repeated time resolves to its first occurrence.
 */
export function zonedTimeToTimestamp(wall: WallTime, zone: string): number {
	const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
	const offsetBefore = offsetOf(zone, naive - DAY_MS);
	const offsetAfter = offsetOf(zone, naive + DAY_MS);
	const matching = [naive - offsetBefore, naive - offsetAfter].filter(timestamp => offsetOf(zone, timestamp) === naive - timestamp);
	if (matching.length > 0) return Math.min(...matching);
	// Skipped by a forward jump: the pre-jump offset lands just after the jump.
	return naive - offsetBefore;
}

function zoneLabel(zone: string, timestamp: number): string {
	if (FIXED_LABELS[zone]) return FIXED_LABELS[zone];
	for (const locale of ['en-US', 'en-GB', 'en-AU']) {
		const label = new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: 'short' })
			.formatToParts(timestamp).find(part => part.type === 'timeZoneName')?.value;
		if (label != null && !label.startsWith('GMT')) return label;
		if (label === 'GMT' && zone !== 'UTC') return label;
	}
	return zone === 'UTC' ? 'UTC' : zone.split('/').at(-1)!.replaceAll('_', ' ');
}

type ParsedInput = { date: { year: number; month: number; day: number } | null; hour: number; minute: number } | 'now';

export function parseTimeInput(source: string, today: { year: number }): ParsedInput {
	const text = source.normalize('NFKC').trim().toLowerCase();
	if (text === 'now' || text === '今') return 'now';

	const match = /^(?:(?:(\d{4})[-/年])?(\d{1,2})[-/月](\d{1,2})日?(?:\s+|t|\s*\(.\)\s*))?(\d{1,2})(?::(\d{2})|時(?:(\d{1,2})分)?)$/.exec(text);
	if (match == null) throw new NoteCommandError('時刻は 21:00、12/24 21:00、2026-12-24 21:00 のように書いてください');
	const [, year, month, day, hour, minuteColon, minuteJa] = match;
	const parsed = {
		date: month != null ? { year: year != null ? Number(year) : today.year, month: Number(month), day: Number(day) } : null,
		hour: Number(hour),
		minute: Number(minuteColon ?? minuteJa ?? 0),
	};
	if (parsed.hour > 23 || parsed.minute > 59) throw new NoteCommandError('時刻が正しくありません');
	if (parsed.date != null) {
		const check = new Date(Date.UTC(parsed.date.year, parsed.date.month - 1, parsed.date.day));
		if (check.getUTCMonth() !== parsed.date.month - 1 || check.getUTCDate() !== parsed.date.day) throw new NoteCommandError('日付が正しくありません');
	}
	return parsed;
}

function dayNumber(wall: WallTime): number {
	return Date.UTC(wall.year, wall.month - 1, wall.day) / 86400000;
}

export function formatAcrossZones(timestamp: number, zones: string[], showDate: boolean): string {
	const reference = wallTimeIn(zones[0], timestamp);
	return zones.map(zone => {
		const wall = wallTimeIn(zone, timestamp);
		const clock = `${String(wall.hour).padStart(2, '0')}:${String(wall.minute).padStart(2, '0')}`;
		const dayShift = dayNumber(wall) - dayNumber(reference);
		const prefix = showDate ? `${wall.month}/${wall.day} ` : '';
		const suffix = !showDate && dayShift !== 0 ? ` (${dayShift > 0 ? '+' : ''}${dayShift}日)` : '';
		return `${prefix}${clock} ${zoneLabel(zone, timestamp)}${suffix}`;
	}).join(' / ');
}

export const time: NoteCommandSpec = {
	name: 'time',
	main: 'rest',
	options: ['zones', 'tz'],
	run(input, ctx) {
		const inputZone = input.options.has('tz') ? resolveZone(input.options.get('tz')!) : ctx.prefs.timezone;
		const outputZones = input.options.has('zones') ? splitList(input.options.get('zones')!).map(resolveZone) : ctx.prefs.timeZones;
		if (outputZones.length > 10) throw new NoteCommandError('タイムゾーンは 10 個までです');
		const zones = [inputZone, ...outputZones.filter(zone => zone !== inputZone)];

		const today = wallTimeIn(inputZone, ctx.now.getTime());
		const parsed = parseTimeInput(input.main ?? 'now', today);
		if (parsed === 'now') return { text: formatAcrossZones(ctx.now.getTime(), zones, false) };

		const date = parsed.date ?? today;
		const timestamp = zonedTimeToTimestamp({ ...date, hour: parsed.hour, minute: parsed.minute }, inputZone);
		return { text: formatAcrossZones(timestamp, zones, parsed.date != null) };
	},
};
