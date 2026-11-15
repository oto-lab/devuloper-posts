/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PALETTE, SANS, escapeXml, estimateTextWidth, fitText, wrapText } from './svg.js';

export type CardBadge = { text: string; color?: string };

export type CardData = {
	/** Where the information came from, such as `GitHub · Pull Request` or `npm`. */
	site: string;
	title: string;
	description: string | null;
	badges: CardBadge[];
	accent: string;
	/** The date the data was fetched, shown because the card does not update later. */
	fetchedOn: string;
};

export const CARD_COLORS = {
	open: '#1a7f37',
	closed: '#cf222e',
	merged: '#8250df',
	draft: '#6e7781',
	neutral: '#0969da',
};

export function formatCount(value: number): string {
	if (value >= 1e9) return `${Number((value / 1e9).toPrecision(3))}B`;
	if (value >= 1e6) return `${Number((value / 1e6).toPrecision(3))}M`;
	if (value >= 1e3) return `${Number((value / 1e3).toPrecision(3))}k`;
	return String(value);
}

export function formatDateIn(date: Date, zone: string): string {
	return new Intl.DateTimeFormat('ja-JP', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric' }).format(date);
}

export function renderCardSvg(card: CardData): string {
	const width = 1200;
	const height = 630;
	const left = 72;
	const contentWidth = width - left - 64;
	const parts: string[] = [
		`<rect width="${width}" height="${height}" fill="${PALETTE.background}"/>`,
		`<rect width="16" height="${height}" fill="${card.accent}"/>`,
		`<text x="${left}" y="92" font-size="28" fill="${PALETTE.muted}">${escapeXml(fitText(card.site, 28, contentWidth))}</text>`,
	];

	const titleLines = wrapText(card.title, 56, contentWidth, 2);
	titleLines.forEach((line, i) => {
		parts.push(`<text x="${left}" y="${176 + i * 70}" font-size="56" font-weight="bold" fill="${PALETTE.text}">${escapeXml(line)}</text>`);
	});
	if (card.description != null && card.description !== '') {
		const top = 176 + titleLines.length * 70 + 10;
		wrapText(card.description, 30, contentWidth, titleLines.length > 1 ? 3 : 4).forEach((line, i) => {
			parts.push(`<text x="${left}" y="${top + i * 44}" font-size="30" fill="${PALETTE.muted}">${escapeXml(line)}</text>`);
		});
	}

	let cursor = left;
	for (const badge of card.badges) {
		const label = fitText(badge.text, 26, 360);
		const badgeWidth = estimateTextWidth(label, 26) + 40;
		if (cursor + badgeWidth > left + contentWidth) break;
		const color = badge.color ?? PALETTE.text;
		parts.push(`<rect x="${cursor}" y="${height - 120}" width="${badgeWidth}" height="52" rx="26" fill="${badge.color != null ? color : PALETTE.surface}" fill-opacity="${badge.color != null ? 0.12 : 1}"/>`);
		parts.push(`<text x="${cursor + 20}" y="${height - 85}" font-size="26" fill="${color}">${escapeXml(label)}</text>`);
		cursor += badgeWidth + 14;
	}
	parts.push(`<text x="${width - 64}" y="${height - 28}" font-size="20" fill="${PALETTE.muted}" text-anchor="end">取得: ${escapeXml(card.fetchedOn)}</text>`);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${SANS}">${parts.join('')}</svg>`;
}

export function describeCard(card: CardData): string {
	return [
		`${card.site}: ${card.title}`,
		...(card.description ? [card.description] : []),
		...(card.badges.length > 0 ? [card.badges.map(badge => badge.text).join(' / ')] : []),
		`取得: ${card.fetchedOn}`,
	].join('\n');
}
