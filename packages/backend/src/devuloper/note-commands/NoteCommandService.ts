/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { promises as fs } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { DB_MAX_IMAGE_COMMENT_LENGTH, MAX_NOTE_TEXT_LENGTH } from '@/const.js';
import { DriveService } from '@/core/DriveService.js';
import { RegistryApiService } from '@/core/RegistryApiService.js';
import { bindThis } from '@/decorators.js';
import { createTemp } from '@/misc/create-temp.js';
import type { MiUser } from '@/models/User.js';
import { ApiError } from '@/server/api/error.js';
import { NOTE_COMMANDS } from './commands/index.js';
import { PREFS_KEY, PREFS_SCOPE, readPrefs } from './prefs.js';
import { findCommands, parseArgs, splitFirstWord } from './syntax.js';
import { NoteCommandError } from './types.js';
import type { GeneratedFile, NoteCommandContext, NoteCommandInput, NoteCommandSpec } from './types.js';

const MAX_COMMANDS_PER_NOTE = 10;
const MAX_FILES_PER_NOTE = 16;

const SPECS = new Map(NOTE_COMMANDS.map(spec => [spec.name, spec]));
const BASE_NAMES = new Set(NOTE_COMMANDS.map(spec => spec.name.split('.')[0]));

type Poster = { id: MiUser['id']; username: MiUser['username']; host: MiUser['host'] };

export type ExpandedText = { text: string; files: GeneratedFile[] };

function commandFailed(message: string, info?: unknown): ApiError {
	return new ApiError({
		message,
		code: 'NOTE_COMMAND_FAILED',
		id: '0b1f7cc4-5a3e-4b8e-9d55-3f0d6b7d2e41',
		// ApiCallService copies the message of a 'client' error into the WWW-Authenticate header,
		// which rejects the Japanese text with a 500. The explicit status keeps it a 400.
		kind: 'server',
		httpStatusCode: 400,
	}, info);
}

function isKnownCommand(name: string): boolean {
	return BASE_NAMES.has(name.split('.')[0]);
}

function resolveSpec(name: string): NoteCommandSpec {
	const spec = SPECS.get(name);
	if (spec != null) return spec;
	const base = name.split('.')[0];
	const variants = NOTE_COMMANDS.filter(candidate => candidate.name.startsWith(`${base}.`)).map(candidate => candidate.name);
	throw new NoteCommandError(variants.length > 0 ? `${variants.join('、')} のどれかを使ってください` : 'この書き方には対応していません');
}

function toInput(spec: NoteCommandSpec, body: string): NoteCommandInput {
	const optionKeys = new Set([...(spec.options ?? []), ...(spec.mainKey ? [spec.mainKey] : [])]);
	const { options, rest } = parseArgs(body, optionKeys);
	const mainFromOption = spec.mainKey != null ? options.get(spec.mainKey) ?? null : null;

	let main: string | null = null;
	let text = '';
	if (spec.main === 'none' || mainFromOption != null) {
		main = mainFromOption;
		text = rest.trim();
	} else if (spec.main === 'rest') {
		main = rest.trim() === '' ? null : rest.trim();
	} else {
		const split = splitFirstWord(rest);
		main = split.word;
		text = split.remainder;
	}

	if (!spec.takesText && text !== '') throw new NoteCommandError(`余分な引数があります: ${text}`);
	return { options, main, text };
}

/**
 * Runs the server-side `%%command …%%` syntax (fork issue #6) for notes created by local users.
 * Each occurrence is replaced by its command's text, and generated images go to the poster's drive.
 */
@Injectable()
export class NoteCommandService {
	constructor(
		private driveService: DriveService,
		private registryApiService: RegistryApiService,
	) {
	}

	/**
	 * Expands every command in `text` without saving anything.
	 *
	 * @throws ApiError `NOTE_COMMAND_FAILED` with a message for the poster when a command is malformed or fails.
	 * @example
	 * await noteCommandService.expand(me, 'Lunch: %%rand.choose ramen|curry%%');
	 * // => { text: 'Lunch: 🎯 curry', files: [] }
	 */
	@bindThis
	public async expand(user: Poster, text: string): Promise<ExpandedText> {
		const occurrences = findCommands(text, isKnownCommand);
		if (occurrences.length === 0) return { text, files: [] };
		if (occurrences.length > MAX_COMMANDS_PER_NOTE) throw commandFailed(`%%command%% は 1 つのノートに ${MAX_COMMANDS_PER_NOTE} 個までです`);

		const ctx: NoteCommandContext = {
			user,
			prefs: readPrefs((await this.registryApiService.getItem(user.id, null, PREFS_SCOPE, PREFS_KEY))?.value),
			now: new Date(),
		};

		let expanded = '';
		let cursor = 0;
		const files: GeneratedFile[] = [];
		for (const occurrence of occurrences) {
			try {
				const spec = resolveSpec(occurrence.name);
				const output = await spec.run(toInput(spec, occurrence.body), ctx);
				expanded += text.slice(cursor, occurrence.start) + output.text;
				files.push(...output.files ?? []);
			} catch (err) {
				if (err instanceof NoteCommandError) throw commandFailed(`%%${occurrence.name}%%: ${err.message}`, { command: occurrence.name });
				throw err;
			}
			cursor = occurrence.end;
		}
		return { text: expanded + text.slice(cursor), files };
	}

	/**
	 * Expands commands in a note about to be created and uploads generated files to the poster's drive.
	 * Returns the input unchanged when the text has no command.
	 *
	 * @throws ApiError `NOTE_COMMAND_FAILED` when a command fails, or when the result exceeds the note's text or file limits.
	 */
	@bindThis
	public async expandNote<T extends { text: string | null; fileIds: string[] }>(user: Poster, data: T): Promise<T> {
		if (data.text == null || !/[%％]/.test(data.text)) return data;

		const { text, files } = await this.expand(user, data.text);
		if (text === data.text && files.length === 0) return data;
		if (text.length > MAX_NOTE_TEXT_LENGTH) throw commandFailed(`%%command%% を展開すると本文が ${MAX_NOTE_TEXT_LENGTH} 文字を超えます`);
		if (data.fileIds.length + files.length > MAX_FILES_PER_NOTE) throw commandFailed(`添付ファイルが ${MAX_FILES_PER_NOTE} 個を超えます`);

		const uploadedIds: string[] = [];
		for (const file of files) {
			uploadedIds.push((await this.saveToDrive(user, file)).id);
		}
		return { ...data, text, fileIds: [...data.fileIds, ...uploadedIds] };
	}

	private async saveToDrive(user: Poster, file: GeneratedFile) {
		const [path, cleanup] = await createTemp();
		try {
			await fs.writeFile(path, file.data);
			return await this.driveService.addFile({
				user,
				path,
				name: file.name,
				comment: file.comment.slice(0, DB_MAX_IMAGE_COMMENT_LENGTH),
				// Without force, a byte-identical earlier upload is reused along with its old alt text.
				force: true,
			});
		} finally {
			cleanup();
		}
	}
}
