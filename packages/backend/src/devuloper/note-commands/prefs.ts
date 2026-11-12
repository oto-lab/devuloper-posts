/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** Where the web client stores the poster's settings (registry, domain null). Keep in sync with the frontend. */
export const PREFS_SCOPE = ['client', 'devuloper'];
export const PREFS_KEY = 'noteCommands';

export type NoteCommandPrefs = {
	timezone: string;
	timeZones: string[];
	weekStart: 'mon' | 'sun';
	githubUsername: string | null;
};

export const DEFAULT_PREFS: NoteCommandPrefs = {
	timezone: 'Asia/Tokyo',
	timeZones: ['UTC', 'America/Los_Angeles', 'America/New_York', 'Europe/London'],
	weekStart: 'mon',
	githubUsername: null,
};

export function isValidTimeZone(zone: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: zone });
		return true;
	} catch {
		return false;
	}
}

/** Registry values are written by clients, so every field is checked and falls back to the default. */
export function readPrefs(raw: unknown): NoteCommandPrefs {
	const value = (typeof raw === 'object' && raw != null ? raw : {}) as Record<string, unknown>;
	const timezone = typeof value.timezone === 'string' && isValidTimeZone(value.timezone) ? value.timezone : DEFAULT_PREFS.timezone;
	const timeZones = Array.isArray(value.timeZones)
		? value.timeZones.filter((zone): zone is string => typeof zone === 'string' && isValidTimeZone(zone)).slice(0, 10)
		: [];
	const githubUsername = typeof value.githubUsername === 'string' && /^[A-Za-z0-9-]{1,39}$/.test(value.githubUsername) ? value.githubUsername : null;
	return {
		timezone,
		timeZones: timeZones.length > 0 ? timeZones : DEFAULT_PREFS.timeZones,
		weekStart: value.weekStart === 'sun' ? 'sun' : 'mon',
		githubUsername,
	};
}
