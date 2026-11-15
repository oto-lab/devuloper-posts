/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { SpotifyError, SpotifyService } from '@/devuloper/spotify/SpotifyService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	requireCredential: true,
	secure: true,
	kind: 'write:account',
	description: 'Fork-only (oto-lab/devuloper-posts). Returns the Spotify authorization URL for linking the account used by %%np%%.',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			url: { type: 'string', optional: false, nullable: false },
		},
	},

	errors: {
		notConfigured: {
			message: 'Spotify is not configured on this server.',
			code: 'SPOTIFY_NOT_CONFIGURED',
			id: '6c0a8f0e-3d2b-4f35-9e5b-0b7a1f2c4d61',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private spotifyService: SpotifyService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				return { url: await this.spotifyService.createAuthorizeUrl(me.id) };
			} catch (err) {
				if (err instanceof SpotifyError && err.reason === 'notConfigured') throw new ApiError(meta.errors.notConfigured);
				throw err;
			}
		});
	}
}
