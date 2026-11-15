/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { formatNowPlaying, np } from '@/devuloper/note-commands/commands/np.js';
import { SpotifyError } from '@/devuloper/spotify/SpotifyService.js';
import { NoteCommandError } from '@/devuloper/note-commands/types.js';
import type { NowPlaying } from '@/devuloper/spotify/SpotifyService.js';

const track: NowPlaying = { kind: 'track', title: 'Song', by: 'Artist A, Artist B', album: 'Album', url: 'https://open.spotify.com/track/1' };

describe('np', () => {
	test('defaults to the SpotifyNowPlaying share text', () => {
		expect(formatNowPlaying(track, 'nowplaying', true)).toBe('#NowPlaying\nSong - Artist A, Artist B\nhttps://open.spotify.com/track/1');
		expect(formatNowPlaying(track, 'nowplaying', false)).toBe('#NowPlaying\nSong - Artist A, Artist B');
	});

	test('formats a track on one line', () => {
		expect(formatNowPlaying(track, 'full', true)).toBe('🎵 Song - Artist A, Artist B (Album)\nhttps://open.spotify.com/track/1');
		expect(formatNowPlaying(track, 'short', false)).toBe('🎵 Song - Artist A, Artist B');
	});

	test('formats an episode and skips an album named like the track', () => {
		expect(formatNowPlaying({ ...track, kind: 'episode', by: 'Show', album: null }, 'full', false)).toBe('🎙️ Song - Show');
		expect(formatNowPlaying({ ...track, album: 'Song' }, 'full', false)).toBe('🎵 Song - Artist A, Artist B');
	});

	const run = (playing: () => Promise<NowPlaying | null>, options: Record<string, string> = {}) => np.run(
		{ main: null, text: '', options: new Map(Object.entries(options)) },
		{ user: { id: 'u', username: 'alice', host: null }, now: new Date(), prefs: {} as never, services: { spotifyService: { getNowPlaying: playing } } as never },
	);

	test('turns Spotify problems and silence into messages for the poster', async () => {
		await expect(run(async () => null)).rejects.toThrow(NoteCommandError);
		await expect(run(async () => { throw new SpotifyError('notLinked', 'not linked'); })).rejects.toThrow('not linked');
		expect((await run(async () => track, { link: 'off', format: 'short' })).text).toBe('🎵 Song - Artist A, Artist B');
		expect((await run(async () => track)).text).toBe('#NowPlaying\nSong - Artist A, Artist B\nhttps://open.spotify.com/track/1');
	});
});
