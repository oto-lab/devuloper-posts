/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { cached, fetchText, githubHeaders } from '../external.js';
import { PALETTE, SANS, escapeXml, fitText, svgToFile } from '../render/svg.js';
import { NoteCommandError, intOption } from '../types.js';
import type { NoteCommandContext, NoteCommandSpec } from '../types.js';

export type ContributionDay = { date: string; count: number; level: number };

const LEVEL_COLORS = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];
const USERNAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

function attribute(tag: string, name: string): string | null {
	return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
}

/**
 * Reads the calendar from the HTML of github.com/users/<name>/contributions.
 * Levels come from `data-level` on each cell and counts from the tooltip linked by the cell's id.
 */
export function parseContributionsHtml(html: string): ContributionDay[] {
	const counts = new Map<string, number>();
	for (const match of html.matchAll(/<tool-tip\b[^>]*\sfor="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
		const number = /^([\d,]+) contributions?/.exec(match[2].trim());
		counts.set(match[1], number ? Number(number[1].replaceAll(',', '')) : 0);
	}
	const days: ContributionDay[] = [];
	for (const match of html.matchAll(/<td\b[^>]*ContributionCalendar-day[^>]*>/g)) {
		const date = attribute(match[0], 'data-date');
		const id = attribute(match[0], 'id');
		if (date == null) continue;
		days.push({ date, count: id != null ? counts.get(id) ?? 0 : 0, level: Number(attribute(match[0], 'data-level') ?? 0) });
	}
	return days.sort((a, b) => a.date.localeCompare(b.date));
}

const LEVELS: Record<string, number> = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

async function fetchWithGraphql(ctx: NoteCommandContext, username: string): Promise<ContributionDay[]> {
	const query = 'query($login: String!) { user(login: $login) { contributionsCollection { contributionCalendar { weeks { contributionDays { date contributionCount contributionLevel } } } } } }';
	let json: { data?: { user: { contributionsCollection: { contributionCalendar: { weeks: { contributionDays: { date: string; contributionCount: number; contributionLevel: string }[] }[] } } } | null } };
	try {
		const res = await ctx.services.httpRequestService.send('https://api.github.com/graphql', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...githubHeaders() },
			body: JSON.stringify({ query, variables: { login: username } }),
			timeout: 10000,
		});
		json = await res.json() as typeof json;
	} catch {
		throw new NoteCommandError('GitHub からコントリビューションを取得できませんでした');
	}
	const user = json.data?.user;
	if (user == null) throw new NoteCommandError(`GitHub のユーザーが見つかりません: ${username}`);
	return user.contributionsCollection.contributionCalendar.weeks.flatMap(week => week.contributionDays.map(day => ({
		date: day.date, count: day.contributionCount, level: LEVELS[day.contributionLevel] ?? 0,
	})));
}

async function fetchContributions(ctx: NoteCommandContext, username: string): Promise<ContributionDay[]> {
	return await cached(`contrib:${username.toLowerCase()}`, async () => {
		if (githubHeaders().Authorization != null) return await fetchWithGraphql(ctx, username);
		const html = await fetchText(ctx, `https://github.com/users/${username}/contributions`, `GitHub のユーザー ${username} のコントリビューション`);
		const days = parseContributionsHtml(html);
		if (days.length === 0) throw new NoteCommandError('コントリビューションを読み取れませんでした');
		return days;
	});
}

/** Lays the days out as GitHub does: one column per week, Sunday at the top. */
function renderContribSvg(username: string, days: ContributionDay[], total: number, weeks: number): string {
	const firstWeekday = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
	const columns = Math.ceil((days.length + firstWeekday) / 7);
	const cell = Math.min(24, Math.floor(1080 / columns) - 4);
	const gap = 4;
	const left = 60;
	const top = 130;
	const gridWidth = columns * (cell + gap);
	const width = Math.max(600, left + gridWidth + 40);
	const height = top + 7 * (cell + gap) + 70;

	const parts: string[] = [`<rect width="${width}" height="${height}" fill="${PALETTE.background}"/>`];
	parts.push(`<text x="${left}" y="58" font-size="32" font-weight="bold" fill="${PALETTE.text}">${escapeXml(fitText(`@${username}`, 32, width - left - 40))}</text>`);
	parts.push(`<text x="${left}" y="96" font-size="22" fill="${PALETTE.muted}">直近${weeks}週で ${total} contributions (${days[0].date}〜${days.at(-1)!.date})</text>`);

	let lastMonth = -1;
	days.forEach((day, i) => {
		const slot = i + firstWeekday;
		const column = Math.floor(slot / 7);
		const row = slot % 7;
		const x = left + column * (cell + gap);
		const y = top + row * (cell + gap);
		parts.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="${Math.max(2, cell / 6)}" fill="${LEVEL_COLORS[day.level] ?? LEVEL_COLORS[0]}"/>`);
		const month = Number(day.date.slice(5, 7));
		if (row === 0 && month !== lastMonth) {
			parts.push(`<text x="${x}" y="${top - 10}" font-size="16" fill="${PALETTE.muted}">${month}月</text>`);
			lastMonth = month;
		}
	});
	['月', '水', '金'].forEach((label, i) => {
		parts.push(`<text x="${left - 12}" y="${top + (i * 2 + 1) * (cell + gap) + cell * 0.75}" font-size="16" fill="${PALETTE.muted}" text-anchor="end">${label}</text>`);
	});
	const legendY = height - 32;
	parts.push(`<text x="${width - 40 - 5 * (cell + gap) - 16}" y="${legendY + cell * 0.75}" font-size="16" fill="${PALETTE.muted}" text-anchor="end">少</text>`);
	LEVEL_COLORS.forEach((color, i) => {
		parts.push(`<rect x="${width - 40 - (5 - i) * (cell + gap)}" y="${legendY}" width="${cell}" height="${cell}" rx="${Math.max(2, cell / 6)}" fill="${color}"/>`);
	});
	parts.push(`<text x="${width - 34}" y="${legendY + cell * 0.75}" font-size="16" fill="${PALETTE.muted}">多</text>`);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${SANS}">${parts.join('')}</svg>`;
}

export const contrib: NoteCommandSpec = {
	name: 'contrib',
	main: 'word',
	mainKey: 'user',
	options: ['weeks'],
	async run(input, ctx) {
		const username = input.main ?? ctx.prefs.githubUsername;
		if (username == null) throw new NoteCommandError('GitHub のユーザー名を書くか、コマンドの設定で保存してください');
		if (!USERNAME.test(username)) throw new NoteCommandError(`GitHub のユーザー名が正しくありません: ${username}`);
		const weeks = intOption(input, 'weeks', { min: 4, max: 53, fallback: 53 });

		const allDays = await fetchContributions(ctx, username);
		const days = allDays.slice(-weeks * 7);
		const total = days.reduce((sum, day) => sum + day.count, 0);
		return {
			text: '',
			files: [await svgToFile(
				renderContribSvg(username, days, total, weeks),
				'contributions.png',
				`GitHub の @${username} のコントリビューション: 直近${weeks}週で ${total} 回 (${days[0].date}〜${days.at(-1)!.date})`,
			)],
		};
	},
};
