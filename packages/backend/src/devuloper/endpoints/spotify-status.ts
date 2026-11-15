/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { SpotifyService } from '@/devuloper/spotify/SpotifyService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	requireCredential: true,
	kind: 'read:account',
	description: 'Fork-only (oto-lab/devuloper-posts). Whether Spotify linking is available and whether the user has linked an account.',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			configured: { type: 'boolean', optional: false, nullable: false },
			linked: { type: 'boolean', optional: false, nullable: false },
			spotifyUserName: { type: 'string', optional: false, nullable: true },
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
			const link = await this.spotifyService.getLink(me.id);
			return { configured: this.spotifyService.isConfigured(), linked: link != null, spotifyUserName: link?.spotifyUserName ?? null };
		});
	}
}
