/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Injectable } from '@nestjs/common';
import { MAX_NOTE_TEXT_LENGTH } from '@/const.js';
import { NoteCommandService } from '@/devuloper/note-commands/NoteCommandService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	tags: ['notes'],

	requireCredential: true,
	kind: 'read:account',

	description: 'Fork-only (oto-lab/devuloper-posts). Expands `%%command …%%` syntax in `text` the same way notes/create does, without posting or saving files.',

	limit: {
		duration: ms('1minute'),
		max: 30,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			text: { type: 'string', optional: false, nullable: false },
			files: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						name: { type: 'string', optional: false, nullable: false },
						type: { type: 'string', optional: false, nullable: false },
						comment: { type: 'string', optional: false, nullable: false },
						dataUrl: { type: 'string', optional: false, nullable: false },
					},
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		text: { type: 'string', minLength: 1, maxLength: MAX_NOTE_TEXT_LENGTH },
	},
	required: ['text'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private noteCommandService: NoteCommandService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const { text, files } = await this.noteCommandService.expand(me, ps.text);
			return {
				text,
				files: files.map(file => ({
					name: file.name,
					type: file.type,
					comment: file.comment,
					dataUrl: `data:${file.type};base64,${file.data.toString('base64')}`,
				})),
			};
		});
	}
}
