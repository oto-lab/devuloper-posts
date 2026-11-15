/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DataSource } from 'typeorm';
import type { Config } from '@/config.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { bindThis } from '@/decorators.js';
import { DI } from '@/di-symbols.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import { StatusError } from '@/misc/status-error.js';
import type { MiUser } from '@/models/User.js';

const STATE_TTL_SECONDS = 10 * 60;
const SCOPES = 'user-read-currently-playing user-read-playback-state';

export type NowPlaying = {
	kind: 'track' | 'episode';
	title: string;
	/** Artists for a track, the show for an episode. */
	by: string;
	album: string | null;
	url: string | null;
};

export class SpotifyError extends Error {
	constructor(public reason: 'notConfigured' | 'notLinked' | 'invalidState' | 'failed', message: string) {
		super(message);
	}
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string };

/**
 * Links a local user's Spotify account and reads what they are playing (fork issue #5).
 * Credentials come from DEVULOPER_SPOTIFY_CLIENT_ID / DEVULOPER_SPOTIFY_CLIENT_SECRET so the config file stays upstream's.
 * Refresh tokens live in `devuloper_spotify_link`, which no API exposes.
 */
@Injectable()
export class SpotifyService {
	private accessTokens = new Map<MiUser['id'], { token: string; expiresAt: number }>();

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		private httpRequestService: HttpRequestService,
	) {
	}

	private get credentials(): { id: string; secret: string } {
		const id = process.env.DEVULOPER_SPOTIFY_CLIENT_ID;
		const secret = process.env.DEVULOPER_SPOTIFY_CLIENT_SECRET;
		if (!id || !secret) throw new SpotifyError('notConfigured', 'このサーバーでは Spotify 連携が設定されていません');
		return { id, secret };
	}

	/** Register exactly this URL as a Redirect URI in the Spotify app. */
	public get redirectUri(): string {
		return `${this.config.url}/api/devuloper/spotify/callback`;
	}

	@bindThis
	public isConfigured(): boolean {
		return Boolean(process.env.DEVULOPER_SPOTIFY_CLIENT_ID && process.env.DEVULOPER_SPOTIFY_CLIENT_SECRET);
	}

	@bindThis
	public async createAuthorizeUrl(userId: MiUser['id']): Promise<string> {
		const { id } = this.credentials;
		const state = secureRndstr(32);
		await this.redisClient.set(`devuloper:spotify:state:${state}`, userId, 'EX', STATE_TTL_SECONDS);
		const params = new URLSearchParams({ client_id: id, response_type: 'code', redirect_uri: this.redirectUri, scope: SCOPES, state });
		return `https://accounts.spotify.com/authorize?${params}`;
	}

	private async requestToken(body: Record<string, string>): Promise<TokenResponse> {
		const { id, secret } = this.credentials;
		try {
			const res = await this.httpRequestService.send('https://accounts.spotify.com/api/token', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'Authorization': `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
				},
				body: new URLSearchParams(body).toString(),
				timeout: 10000,
			});
			return await res.json() as TokenResponse;
		} catch (err) {
			if (err instanceof StatusError && err.statusCode === 400 && body.grant_type === 'refresh_token') {
				throw new SpotifyError('notLinked', 'Spotify との連携が切れています。もう一度連携してください');
			}
			throw new SpotifyError('failed', 'Spotify に接続できませんでした');
		}
	}

	/** Completes the OAuth flow; the state ties the browser callback back to the user who started it. */
	@bindThis
	public async completeAuthorization(code: string, state: string): Promise<void> {
		const userId = await this.redisClient.getdel(`devuloper:spotify:state:${state}`);
		if (userId == null) throw new SpotifyError('invalidState', '連携の有効期限が切れました。もう一度やり直してください');

		const token = await this.requestToken({ grant_type: 'authorization_code', code, redirect_uri: this.redirectUri });
		if (token.refresh_token == null) throw new SpotifyError('failed', 'Spotify からトークンを受け取れませんでした');
		const profile = await this.callApi<{ display_name: string | null; id: string }>(token.access_token, 'https://api.spotify.com/v1/me').catch(() => null);

		await this.db.query(
			'INSERT INTO "devuloper_spotify_link" ("userId", "refreshToken", "spotifyUserName") VALUES ($1, $2, $3) ON CONFLICT ("userId") DO UPDATE SET "refreshToken" = EXCLUDED."refreshToken", "spotifyUserName" = EXCLUDED."spotifyUserName", "createdAt" = now()',
			[userId, token.refresh_token, profile?.display_name ?? profile?.id ?? null],
		);
		this.accessTokens.set(userId, { token: token.access_token, expiresAt: Date.now() + (token.expires_in - 60) * 1000 });
	}

	@bindThis
	public async getLink(userId: MiUser['id']): Promise<{ spotifyUserName: string | null } | null> {
		const rows: { spotifyUserName: string | null }[] = await this.db.query('SELECT "spotifyUserName" FROM "devuloper_spotify_link" WHERE "userId" = $1', [userId]);
		return rows[0] ?? null;
	}

	@bindThis
	public async unlink(userId: MiUser['id']): Promise<void> {
		this.accessTokens.delete(userId);
		await this.db.query('DELETE FROM "devuloper_spotify_link" WHERE "userId" = $1', [userId]);
	}

	private async accessTokenFor(userId: MiUser['id']): Promise<string> {
		const cached = this.accessTokens.get(userId);
		if (cached != null && cached.expiresAt > Date.now()) return cached.token;

		const rows: { refreshToken: string }[] = await this.db.query('SELECT "refreshToken" FROM "devuloper_spotify_link" WHERE "userId" = $1', [userId]);
		if (rows.length === 0) throw new SpotifyError('notLinked', 'Spotify と連携していません。投稿フォームのコマンドメニューの「Spotify 連携」から連携してください');

		const token = await this.requestToken({ grant_type: 'refresh_token', refresh_token: rows[0].refreshToken });
		// Spotify may rotate the refresh token; the old one stops working once a new one is issued.
		if (token.refresh_token != null) {
			await this.db.query('UPDATE "devuloper_spotify_link" SET "refreshToken" = $2 WHERE "userId" = $1', [userId, token.refresh_token]);
		}
		this.accessTokens.set(userId, { token: token.access_token, expiresAt: Date.now() + (token.expires_in - 60) * 1000 });
		return token.access_token;
	}

	private async callApi<T>(accessToken: string, url: string): Promise<T | null> {
		const res = await this.httpRequestService.send(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }, timeout: 10000 });
		// 204 means nothing is playing.
		if (res.status === 204) return null;
		return await res.json() as T;
	}

	/** Returns the track or episode the user is playing right now, or null when nothing is playing. */
	@bindThis
	public async getNowPlaying(userId: MiUser['id']): Promise<NowPlaying | null> {
		const accessToken = await this.accessTokenFor(userId);
		type Item = { name: string; artists?: { name: string }[]; album?: { name: string }; show?: { name: string }; external_urls?: { spotify?: string } };
		let playing: { is_playing: boolean; currently_playing_type: string; item: Item | null } | null;
		try {
			playing = await this.callApi(accessToken, 'https://api.spotify.com/v1/me/player/currently-playing?additional_types=track,episode');
		} catch {
			throw new SpotifyError('failed', '再生中の曲を取得できませんでした');
		}
		if (playing?.item == null || !playing.is_playing) return null;

		const item = playing.item;
		const episode = playing.currently_playing_type === 'episode';
		return {
			kind: episode ? 'episode' : 'track',
			title: item.name,
			by: episode ? item.show?.name ?? '' : (item.artists ?? []).map(artist => artist.name).join(', '),
			album: episode ? null : item.album?.name ?? null,
			url: item.external_urls?.spotify ?? null,
		};
	}
}
