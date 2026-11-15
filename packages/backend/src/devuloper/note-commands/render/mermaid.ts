/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { NoteCommandError } from '../types.js';
import type { Browser } from 'puppeteer-core';

const MAX_SOURCE_LENGTH = 5000;
const RENDER_TIMEOUT_MS = 15000;
/** Chrome stays up between posts for a while, then exits so it does not hold memory. */
const BROWSER_IDLE_MS = 60 * 1000;

let browserPromise: Promise<Browser> | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let mermaidScript: Promise<string> | null = null;

/**
 * Mermaid lays out text with the DOM, so it needs a real browser.
 * The server provides one through DEVULOPER_CHROME_PATH (for example chrome-headless-shell); without it Mermaid is unavailable.
 */
function chromePath(): string {
	const path = process.env.DEVULOPER_CHROME_PATH;
	if (path == null || path === '') throw new NoteCommandError('このサーバーでは Mermaid の描画が設定されていません');
	return path;
}

function getBrowser(): Promise<Browser> {
	browserPromise ??= puppeteer.launch({
		executablePath: chromePath(),
		headless: true,
		// Ubuntu's AppArmor blocks the user namespaces Chrome's sandbox needs. Pages here only run Mermaid and every network request is refused.
		args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
	}).then(browser => {
		browser.on('disconnected', () => {
			browserPromise = null;
		});
		return browser;
	}).catch(err => {
		browserPromise = null;
		throw err;
	});
	return browserPromise;
}

function scheduleClose() {
	if (idleTimer != null) clearTimeout(idleTimer);
	idleTimer = setTimeout(() => {
		const closing = browserPromise;
		browserPromise = null;
		closing?.then(browser => browser.close()).catch(() => {});
	}, BROWSER_IDLE_MS);
}

/**
 * Renders a Mermaid diagram to PNG in headless Chrome.
 *
 * @throws NoteCommandError when the diagram is invalid or the browser is not configured.
 */
export async function renderMermaidPng(rootDir: string, source: string, theme: 'light' | 'dark'): Promise<Buffer> {
	if (source.length > MAX_SOURCE_LENGTH) throw new NoteCommandError(`Mermaid の図は ${MAX_SOURCE_LENGTH} 文字までです`);
	mermaidScript ??= readFile(resolve(rootDir, 'packages/backend/node_modules/mermaid/dist/mermaid.min.js'), 'utf8');

	let browser: Browser;
	try {
		browser = await getBrowser();
	} catch (err) {
		if (err instanceof NoteCommandError) throw err;
		throw new NoteCommandError('Mermaid を描画するブラウザを起動できませんでした');
	}
	const page = await browser.newPage();
	try {
		page.setDefaultTimeout(RENDER_TIMEOUT_MS);
		await page.setRequestInterception(true);
		page.on('request', request => {
			if (request.url().startsWith('data:') || request.url() === 'about:blank') void request.continue();
			else void request.abort();
		});
		await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
		const background = theme === 'dark' ? '#0d1117' : '#ffffff';
		await page.setContent(`<!DOCTYPE html><html><body style="margin:0;background:${background}"><div id="diagram" style="display:inline-block;padding:24px;background:${background}"></div></body></html>`);
		await page.addScriptTag({ content: await mermaidScript });

		const error = await page.evaluate(async (diagram, mermaidTheme) => {
			// Runs inside the page; the backend has no DOM types, so the globals are typed by hand.
			const { mermaid, document } = globalThis as unknown as {
				mermaid: { initialize: (config: object) => void; render: (id: string, text: string) => Promise<{ svg: string }> };
				document: { getElementById: (id: string) => { innerHTML: string } | null };
			};
			mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: mermaidTheme, fontFamily: '\'Noto Sans CJK JP\', sans-serif' });
			try {
				const { svg } = await mermaid.render('rendered', diagram);
				document.getElementById('diagram')!.innerHTML = svg;
				return null;
			} catch (err) {
				return err instanceof Error ? err.message : String(err);
			}
		}, source, theme === 'dark' ? 'dark' : 'default');
		if (error != null) throw new NoteCommandError(`Mermaid の図を読めません: ${error.split('\n')[0]}`);

		const element = await page.$('#diagram');
		if (element == null) throw new NoteCommandError('Mermaid の図を描画できませんでした');
		return Buffer.from(await element.screenshot({ type: 'png' }));
	} catch (err) {
		if (err instanceof NoteCommandError) throw err;
		throw new NoteCommandError('Mermaid の図を描画できませんでした (時間切れなど)');
	} finally {
		await page.close().catch(() => {});
		scheduleClose();
	}
}
