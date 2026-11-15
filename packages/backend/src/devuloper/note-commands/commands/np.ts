/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { SpotifyError } from '@/devuloper/spotify/SpotifyService.js';
import type { NowPlaying } from '@/devuloper/spotify/SpotifyService.js';
import { NoteCommandError, enumOption, flagOption } from '../types.js';
import type { NoteCommandSpec } from '../types.js';

export type NowPlayingFormat = 'nowplaying' | 'full' | 'short';

/**
 * `nowplaying` follows the share text of otnc/SpotifyNowPlaying: `#NowPlaying`, `title - artists`, then the URL.
 * `full` and `short` are one line with an emoji, with and without the album.
 */
export function formatNowPlaying(playing: NowPlaying, format: NowPlayingFormat, link: boolean): string {
	const url = link && playing.url != null ? playing.url : null;
	if (format === 'nowplaying') {
		return ['#NowPlaying', `${playing.title}${playing.by !== '' ? ` - ${playing.by}` : ''}`, ...(url != null ? [url] : [])].join('\n');
	}
	const icon = playing.kind === 'episode' ? '🎙️' : '🎵';
	const album = format === 'full' && playing.album != null && playing.album !== playing.title ? ` (${playing.album})` : '';
	const line = `${icon} ${playing.title}${playing.by !== '' ? ` - ${playing.by}` : ''}${album}`;
	// The URL on its own line lets other servers show a link preview of the track.
	return url != null ? `${line}\n${url}` : line;
}

export const np: NoteCommandSpec = {
	name: 'np',
	main: 'none',
	options: ['link', 'format'],
	async run(input, ctx) {
		const link = input.options.has('link') ? flagOption(input, 'link') : true;
		const format = enumOption<NowPlayingFormat>(input, 'format', ['nowplaying', 'full', 'short'], 'nowplaying');
		let playing: NowPlaying | null;
		try {
			playing = await ctx.services.spotifyService.getNowPlaying(ctx.user.id);
		} catch (err) {
			if (err instanceof SpotifyError) throw new NoteCommandError(err.message);
			throw err;
		}
		if (playing == null) throw new NoteCommandError('いま Spotify で再生している曲がありません');
		return { text: formatNowPlaying(playing, format, link) };
	},
};
