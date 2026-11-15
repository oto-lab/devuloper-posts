/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { misskeyApi } from '@/utility/misskey-api.js';

export type PreviewResult = {
	text: string;
	files: { name: string; type: string; comment: string; dataUrl: string }[];
};

/** Mirrors the backend's PREFS_SCOPE / PREFS_KEY / NoteCommandPrefs. */
export const PREFS_SCOPE = ['client', 'devuloper'];
export const PREFS_KEY = 'noteCommands';

export type NoteCommandPrefs = {
	timezone?: string;
	timeZones?: string[];
	weekStart?: 'mon' | 'sun';
	githubUsername?: string | null;
};

// Fork endpoints are not in misskey-js's generated types, which this fork leaves untouched to avoid conflicts.
const callUntyped = misskeyApi as unknown as <T>(endpoint: string, data: Record<string, unknown>) => Promise<T>;

export function previewNoteCommands(text: string): Promise<PreviewResult> {
	return callUntyped<PreviewResult>('devuloper/note-commands/preview', { text });
}

export async function loadPrefs(): Promise<NoteCommandPrefs> {
	try {
		return await misskeyApi('i/registry/get', { scope: PREFS_SCOPE, key: PREFS_KEY }) as NoteCommandPrefs;
	} catch {
		// i/registry/get fails with NO_SUCH_KEY until the prefs are saved once.
		return {};
	}
}

export async function savePrefs(prefs: NoteCommandPrefs): Promise<void> {
	await misskeyApi('i/registry/set', { scope: PREFS_SCOPE, key: PREFS_KEY, value: prefs });
}
