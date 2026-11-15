/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { SpotifyError, SpotifyService } from '@/devuloper/spotify/SpotifyService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	requireCredential: false,
	// Spotify redirects the browser here with a GET request.
	allowGet: true,
	description: 'Fork-only (oto-lab/devuloper-posts). OAuth redirect target for Spotify; the state identifies the user who started linking.',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			ok: { type: 'boolean', optional: false, nullable: false },
			message: { type: 'string', optional: false, nullable: false },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		code: { type: 'string', maxLength: 2048 },
		state: { type: 'string', maxLength: 128 },
		error: { type: 'string', maxLength: 256 },
	},
	required: [],
} as const;

/**
 * Always answers 200 with a message, because the person reading it is looking at a browser tab
 * opened by the redirect, not at a client that understands API errors.
 */
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private spotifyService: SpotifyService,
	) {
		super(meta, paramDef, async (ps) => {
			if (ps.error != null || ps.code == null || ps.state == null) {
				return { ok: false, message: 'Spotify との連携をキャンセルしました。このタブは閉じてかまいません。' };
			}
			try {
				await this.spotifyService.completeAuthorization(ps.code, ps.state);
				return { ok: true, message: 'Spotify と連携しました。このタブを閉じて、Misskey に戻ってください。' };
			} catch (err) {
				if (err instanceof SpotifyError) return { ok: false, message: err.message };
				throw err;
			}
		});
	}
}
