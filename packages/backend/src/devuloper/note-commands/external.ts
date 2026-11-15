/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { StatusError } from '@/misc/status-error.js';
import { NoteCommandError } from './types.js';
import type { NoteCommandContext } from './types.js';

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

/** Short-lived cache so repeated previews and posts do not hit rate-limited APIs every time. */
const cache = new Map<string, { expiresAt: number; value: Promise<unknown> }>();

export function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
	const now = Date.now();
	const hit = cache.get(key);
	if (hit != null && hit.expiresAt > now) return hit.value as Promise<T>;
	if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!);
	const value = load();
	cache.set(key, { expiresAt: now + CACHE_TTL_MS, value });
	// A failure must not stay cached for the full TTL.
	value.catch(() => cache.delete(key));
	return value;
}

/**
 * GitHub allows 60 unauthenticated API requests per hour per IP.
 * Setting DEVULOPER_GITHUB_TOKEN in the server's environment raises that limit without touching the config file.
 */
export function githubHeaders(): Record<string, string> {
	const token = process.env.DEVULOPER_GITHUB_TOKEN;
	return token ? { Authorization: `Bearer ${token}` } : {};
}

function toCommandError(err: unknown, what: string): NoteCommandError {
	if (err instanceof NoteCommandError) return err;
	if (err instanceof StatusError) {
		if (err.statusCode === 404) return new NoteCommandError(`${what}が見つかりません (非公開か、名前が違う可能性があります)`);
		if (err.statusCode === 403 || err.statusCode === 429) return new NoteCommandError(`${what}の取得が制限されています。しばらく待ってから試してください`);
		return new NoteCommandError(`${what}を取得できませんでした (HTTP ${err.statusCode})`);
	}
	return new NoteCommandError(`${what}を取得できませんでした`);
}

export async function fetchJson<T>(ctx: NoteCommandContext, url: string, what: string, headers: Record<string, string> = {}): Promise<T> {
	return await cached(`json:${url}`, async () => {
		try {
			const res = await ctx.services.httpRequestService.send(url, { headers: { Accept: 'application/json', ...headers }, timeout: 10000, size: 2 * 1024 * 1024 });
			return await res.json() as T;
		} catch (err) {
			throw toCommandError(err, what);
		}
	});
}

export async function fetchText(ctx: NoteCommandContext, url: string, what: string, options: { headers?: Record<string, string>; maxBytes?: number } = {}): Promise<string> {
	return await cached(`text:${url}`, async () => {
		try {
			const res = await ctx.services.httpRequestService.send(url, { headers: options.headers, timeout: 10000, size: options.maxBytes ?? 2 * 1024 * 1024 });
			return await res.text();
		} catch (err) {
			throw toCommandError(err, what);
		}
	});
}

export async function fetchImage(ctx: NoteCommandContext, url: string, what: string): Promise<Buffer> {
	return await cached(`image:${url}`, async () => {
		try {
			const res = await ctx.services.httpRequestService.send(url, { timeout: 10000, size: 10 * 1024 * 1024 });
			if (!(res.headers.get('content-type') ?? '').startsWith('image/')) throw new NoteCommandError(`${what}が画像ではありません`);
			return Buffer.from(await res.arrayBuffer());
		} catch (err) {
			throw toCommandError(err, what);
		}
	});
}
