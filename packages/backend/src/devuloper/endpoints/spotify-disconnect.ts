/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { SpotifyService } from '@/devuloper/spotify/SpotifyService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	requireCredential: true,
	secure: true,
	kind: 'write:account',
	description: 'Fork-only (oto-lab/devuloper-posts). Forgets the linked Spotify account.',
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
			await this.spotifyService.unlink(me.id);
		});
	}
}
