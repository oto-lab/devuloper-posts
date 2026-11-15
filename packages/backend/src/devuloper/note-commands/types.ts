/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import type { IdService } from '@/core/IdService.js';
import type { RoleService } from '@/core/RoleService.js';
import type { SpotifyService } from '@/devuloper/spotify/SpotifyService.js';
import type { MiMeta, NoteReactionsRepository, NotesRepository } from '@/models/_.js';
import type { NoteCommandPrefs } from './prefs.js';

/** A user-facing failure; the message is shown to the poster as is. */
export class NoteCommandError extends Error {}

export type GeneratedFile = {
	name: string;
	type: string;
	data: Buffer;
	/** Alt text; truncated to the drive comment limit on upload. */
	comment: string;
};

export type NoteCommandOutput = {
	text: string;
	files?: GeneratedFile[];
};

export type NoteCommandInput = {
	options: ReadonlyMap<string, string>;
	/** The main argument, from `mainKey:` or the first word (`word`) or everything after the options (`rest`). */
	main: string | null;
	/** Text after the main argument; always empty unless `takesText`. */
	text: string;
};

export type NoteCommandServices = {
	config: Config;
	meta: MiMeta;
	httpRequestService: HttpRequestService;
	idService: IdService;
	roleService: RoleService;
	spotifyService: SpotifyService;
	notesRepository: NotesRepository;
	noteReactionsRepository: NoteReactionsRepository;
};

export type NoteCommandContext = {
	user: { id: string; username: string; host: string | null };
	prefs: NoteCommandPrefs;
	now: Date;
	services: NoteCommandServices;
	/**
	 * The note's text with every other command expanded and this one removed.
	 * Only set for `wholeNote` commands, which run after all the others.
	 */
	noteText?: string;
};

export type NoteCommandSpec = {
	/** Full name, such as `progress` or `rand.dice`. */
	name: string;
	main: 'word' | 'rest' | 'none';
	/** Option key that may carry the main argument, as in `%%tr to:en …%%`. */
	mainKey?: string;
	options?: readonly string[];
	takesText?: boolean;
	/** Runs after the other commands and receives the rest of the note as `ctx.noteText`. */
	wholeNote?: boolean;
	run(input: NoteCommandInput, ctx: NoteCommandContext): NoteCommandOutput | Promise<NoteCommandOutput>;
};

export function requireMain(input: NoteCommandInput, usage: string): string {
	if (input.main == null || input.main === '') throw new NoteCommandError(`引数がありません。書き方: ${usage}`);
	return input.main;
}

export function intOption(input: NoteCommandInput, key: string, range: { min: number; max: number; fallback: number }): number {
	const raw = input.options.get(key);
	if (raw == null) return range.fallback;
	const value = Number(raw.normalize('NFKC'));
	if (!Number.isInteger(value) || value < range.min || value > range.max) {
		throw new NoteCommandError(`${key}: には ${range.min} から ${range.max} までの整数を指定してください`);
	}
	return value;
}

export function enumOption<T extends string>(input: NoteCommandInput, key: string, choices: readonly T[], fallback: T): T {
	const raw = input.options.get(key)?.normalize('NFKC').toLowerCase();
	if (raw == null) return fallback;
	if (!(choices as readonly string[]).includes(raw)) {
		throw new NoteCommandError(`${key}: には ${choices.join('、')} のどれかを指定してください`);
	}
	return raw as T;
}

export function flagOption(input: NoteCommandInput, key: string): boolean {
	const value = enumOption(input, key, ['on', 'off', 'true', 'false', 'yes', 'no'], 'off');
	return value === 'on' || value === 'true' || value === 'yes';
}

export function splitList(value: string): string[] {
	return value.split('|').map(item => item.trim()).filter(item => item !== '');
}
