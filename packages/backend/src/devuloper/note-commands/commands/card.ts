/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import sharp from 'sharp';
import { fetchImage, fetchJson, fetchText, githubHeaders } from '../external.js';
import { CARD_COLORS, describeCard, formatCount, formatDateIn, renderCardSvg } from '../render/card.js';
import { svgToFile } from '../render/svg.js';
import { NoteCommandError, enumOption, requireMain } from '../types.js';
import type { CardBadge, CardData } from '../render/card.js';
import type { GeneratedFile, NoteCommandContext, NoteCommandOutput, NoteCommandSpec } from '../types.js';

type Source = 'gh' | 'npm' | 'pypi' | 'crates' | 'docker' | 'ogp';
type Style = 'ogp' | 'card';
type Card = Omit<CardData, 'fetchedOn'>;

/** A target resolved to its canonical URL, with what is needed to draw either style. */
type Target = {
	url: () => Promise<string>;
	/** An image the site publishes for link previews, used by `style:ogp`. */
	ogImage: () => Promise<string | null>;
	card: () => Promise<Card>;
	defaultStyle: Style;
};

export type GitHubTarget =
	| { kind: 'repo'; owner: string; repo: string }
	/** `pull` is unknown for the short form `owner/repo#12` until the API is asked. */
	| { kind: 'issue'; owner: string; repo: string; number: number; pull?: boolean }
	| { kind: 'discussion'; owner: string; repo: string; number: number }
	| { kind: 'commit'; owner: string; repo: string; sha: string }
	| { kind: 'release'; owner: string; repo: string; tag: string }
	| { kind: 'user'; login: string }
	| { kind: 'gist'; id: string };

const NAME = '[\\w.-]+';

/** Reads GitHub URLs and the short forms `owner/repo`, `owner/repo#12`, `owner/repo@abc1234` and `user`. */
export function parseGitHubTarget(raw: string): GitHubTarget {
	const text = raw.trim().replace(/\/$/, '');
	const gist = /^https:\/\/gist\.github\.com\/[\w-]+\/([0-9a-f]+)$/i.exec(text);
	if (gist) return { kind: 'gist', id: gist[1] };

	const path = /^https:\/\/github\.com\/(.+)$/.exec(text)?.[1].split(/[?#]/)[0];
	if (path != null) {
		const [owner, repo, section, ...rest] = path.split('/');
		if (repo == null) return { kind: 'user', login: owner };
		if (section == null) return { kind: 'repo', owner, repo };
		if ((section === 'issues' || section === 'pull') && /^\d+$/.test(rest[0] ?? '')) return { kind: 'issue', owner, repo, number: Number(rest[0]), pull: section === 'pull' };
		if (section === 'discussions' && /^\d+$/.test(rest[0] ?? '')) return { kind: 'discussion', owner, repo, number: Number(rest[0]) };
		if (section === 'commit' && rest[0] != null) return { kind: 'commit', owner, repo, sha: rest[0] };
		if (section === 'releases' && rest[0] === 'tag' && rest[1] != null) return { kind: 'release', owner, repo, tag: decodeURIComponent(rest.slice(1).join('/')) };
		throw new NoteCommandError('この GitHub のページには対応していません');
	}

	const short = new RegExp(`^(${NAME})/(${NAME})(?:#(\\d+)|@([0-9a-f]{7,40}))?$`, 'i').exec(text);
	if (short) {
		if (short[3] != null) return { kind: 'issue', owner: short[1], repo: short[2], number: Number(short[3]) };
		if (short[4] != null) return { kind: 'commit', owner: short[1], repo: short[2], sha: short[4] };
		return { kind: 'repo', owner: short[1], repo: short[2] };
	}
	if (/^[A-Za-z0-9-]{1,39}$/.test(text)) return { kind: 'user', login: text };
	throw new NoteCommandError('GitHub の URL か、owner/repo、owner/repo#12、owner/repo@コミット、ユーザー名で指定してください');
}

function gitHubUrl(target: GitHubTarget): string {
	switch (target.kind) {
		case 'repo': return `https://github.com/${target.owner}/${target.repo}`;
		case 'issue': return `https://github.com/${target.owner}/${target.repo}/issues/${target.number}`;
		case 'discussion': return `https://github.com/${target.owner}/${target.repo}/discussions/${target.number}`;
		case 'commit': return `https://github.com/${target.owner}/${target.repo}/commit/${target.sha}`;
		case 'release': return `https://github.com/${target.owner}/${target.repo}/releases/tag/${encodeURIComponent(target.tag)}`;
		case 'user': return `https://github.com/${target.login}`;
		case 'gist': return `https://gist.github.com/${target.id}`;
	}
}

function firstLine(text: string | null | undefined): string | null {
	return text?.split('\n').find(line => line.trim() !== '')?.trim() ?? null;
}

function githubTarget(ctx: NoteCommandContext, target: GitHubTarget): Target {
	const api = <T>(path: string) => fetchJson<T>(ctx, `https://api.github.com${path}`, 'GitHub の情報', githubHeaders());
	const repoPath = 'owner' in target ? `${target.owner}/${target.repo}` : null;
	const url = async () => {
		if (target.kind !== 'issue') return gitHubUrl(target);
		const pull = target.pull ?? (await api<{ pull_request?: unknown }>(`/repos/${repoPath}/issues/${target.number}`)).pull_request != null;
		return `https://github.com/${repoPath}/${pull ? 'pull' : 'issues'}/${target.number}`;
	};
	// GitHub serves preview images for repositories and their pages, but only under the page's real path (pull, not issues).
	// The first path segment is an arbitrary cache key.
	const ogImage = async () => target.kind === 'user' || target.kind === 'gist' ? null : `https://opengraph.githubassets.com/1/${(await url()).replace('https://github.com/', '')}`;

	const card = async (): Promise<Card> => {
		switch (target.kind) {
			case 'repo': {
				const repo = await api<{ full_name: string; description: string | null; stargazers_count: number; forks_count: number; language: string | null; license: { spdx_id: string } | null; archived: boolean }>(`/repos/${repoPath}`);
				return {
					site: 'GitHub · リポジトリ', title: repo.full_name, description: repo.description, accent: CARD_COLORS.neutral,
					badges: [
						{ text: `★ ${formatCount(repo.stargazers_count)}` }, { text: `フォーク ${formatCount(repo.forks_count)}` },
						...(repo.language ? [{ text: repo.language }] : []),
						...(repo.license && repo.license.spdx_id !== 'NOASSERTION' ? [{ text: repo.license.spdx_id }] : []),
						...(repo.archived ? [{ text: 'アーカイブ済み', color: CARD_COLORS.draft }] : []),
					],
				};
			}
			case 'issue': {
				const issue = await api<{ title: string; state: string; pull_request?: unknown; labels: { name: string }[]; user: { login: string }; comments: number }>(`/repos/${repoPath}/issues/${target.number}`);
				let state: CardBadge = issue.state === 'open' ? { text: 'Open', color: CARD_COLORS.open } : { text: 'Closed', color: CARD_COLORS.closed };
				if (issue.pull_request != null) {
					const pull = await api<{ merged: boolean; draft: boolean }>(`/repos/${repoPath}/pulls/${target.number}`);
					if (pull.merged) state = { text: 'Merged', color: CARD_COLORS.merged };
					else if (pull.draft && issue.state === 'open') state = { text: 'Draft', color: CARD_COLORS.draft };
				}
				return {
					site: `GitHub · ${repoPath}#${target.number}`, title: issue.title, description: `${issue.pull_request != null ? 'Pull Request' : 'Issue'} by @${issue.user.login}`,
					accent: state.color!,
					badges: [state, { text: `コメント ${issue.comments}` }, ...issue.labels.slice(0, 4).map(label => ({ text: label.name }))],
				};
			}
			case 'commit': {
				const commit = await api<{ sha: string; commit: { message: string; author: { name: string } }; stats?: { additions: number; deletions: number } }>(`/repos/${repoPath}/commits/${target.sha}`);
				return {
					site: `GitHub · ${repoPath}@${commit.sha.slice(0, 7)}`, title: firstLine(commit.commit.message) ?? commit.sha, description: `by ${commit.commit.author.name}`,
					accent: CARD_COLORS.neutral,
					badges: commit.stats ? [{ text: `+${commit.stats.additions}`, color: CARD_COLORS.open }, { text: `-${commit.stats.deletions}`, color: CARD_COLORS.closed }] : [],
				};
			}
			case 'release': {
				const release = await api<{ name: string | null; tag_name: string; body: string | null; prerelease: boolean }>(`/repos/${repoPath}/releases/tags/${encodeURIComponent(target.tag)}`);
				return {
					site: `GitHub · ${repoPath} のリリース`, title: release.name || release.tag_name, description: firstLine(release.body), accent: CARD_COLORS.open,
					badges: [{ text: release.tag_name }, ...(release.prerelease ? [{ text: 'Pre-release', color: CARD_COLORS.draft }] : [])],
				};
			}
			case 'user': {
				const user = await api<{ login: string; name: string | null; bio: string | null; public_repos: number; followers: number; type: string }>(`/users/${target.login}`);
				return {
					site: `GitHub · ${user.type === 'Organization' ? 'Organization' : 'ユーザー'}`, title: user.name ? `${user.name} (@${user.login})` : `@${user.login}`, description: user.bio,
					accent: CARD_COLORS.neutral,
					badges: [{ text: `リポジトリ ${formatCount(user.public_repos)}` }, { text: `フォロワー ${formatCount(user.followers)}` }],
				};
			}
			case 'gist': {
				const gist = await api<{ description: string | null; files: Record<string, unknown>; owner: { login: string } | null }>(`/gists/${target.id}`);
				const names = Object.keys(gist.files);
				return {
					site: `Gist${gist.owner ? ` · @${gist.owner.login}` : ''}`, title: gist.description || names[0] || target.id, description: names.join(', '),
					accent: CARD_COLORS.neutral, badges: [{ text: `ファイル ${names.length}` }],
				};
			}
			case 'discussion':
				throw new NoteCommandError('Discussion は style:ogp だけに対応しています');
		}
	};
	return { url, ogImage, card, defaultStyle: target.kind === 'user' || target.kind === 'gist' ? 'card' : 'ogp' };
}

function packageName(raw: string, pattern: RegExp, what: string): string {
	const name = raw.trim();
	if (!pattern.test(name)) throw new NoteCommandError(`${what}の名前が正しくありません: ${name}`);
	return name;
}

function npmTarget(ctx: NoteCommandContext, raw: string): Target {
	const name = packageName(raw.replace(/^https:\/\/www\.npmjs\.com\/package\//, ''), /^(?:@[\w.-]+\/)?[\w.-]+$/, 'npm のパッケージ');
	const encoded = name.replace('/', '%2F');
	return {
		url: async () => `https://www.npmjs.com/package/${name}`,
		defaultStyle: 'card',
		ogImage: async () => null,
		card: async () => {
			const latest = await fetchJson<{ version: string; description?: string; license?: string }>(ctx, `https://registry.npmjs.org/${encoded}/latest`, 'npm のパッケージ');
			const downloads = await fetchJson<{ downloads?: number }>(ctx, `https://api.npmjs.org/downloads/point/last-week/${name}`, 'npm のダウンロード数').catch(() => ({ downloads: undefined }));
			return {
				site: 'npm', title: name, description: latest.description ?? null, accent: '#cb3837',
				badges: [{ text: `v${latest.version}` }, ...(latest.license ? [{ text: latest.license }] : []), ...(downloads.downloads != null ? [{ text: `↓ ${formatCount(downloads.downloads)}/週` }] : [])],
			};
		},
	};
}

function pypiTarget(ctx: NoteCommandContext, raw: string): Target {
	const name = packageName(raw.replace(/^https:\/\/pypi\.org\/project\//, '').replace(/\/$/, ''), /^[\w.-]+$/, 'PyPI のパッケージ');
	return {
		url: async () => `https://pypi.org/project/${name}/`,
		defaultStyle: 'card',
		ogImage: async () => null,
		card: async () => {
			const { info } = await fetchJson<{ info: { name: string; version: string; summary: string | null; license: string | null; requires_python: string | null } }>(ctx, `https://pypi.org/pypi/${name}/json`, 'PyPI のパッケージ');
			const license = info.license != null && info.license.length <= 30 ? info.license : null;
			return {
				site: 'PyPI', title: info.name, description: info.summary, accent: '#3775a9',
				badges: [{ text: `v${info.version}` }, ...(license ? [{ text: license }] : []), ...(info.requires_python ? [{ text: `Python ${info.requires_python}` }] : [])],
			};
		},
	};
}

function cratesTarget(ctx: NoteCommandContext, raw: string): Target {
	const name = packageName(raw.replace(/^https:\/\/crates\.io\/crates\//, '').replace(/\/$/, ''), /^[\w-]+$/, 'crates.io のクレート');
	return {
		url: async () => `https://crates.io/crates/${name}`,
		defaultStyle: 'card',
		ogImage: async () => null,
		card: async () => {
			const { crate } = await fetchJson<{ crate: { name: string; max_stable_version: string | null; newest_version: string; description: string | null; downloads: number; recent_downloads: number | null } }>(ctx, `https://crates.io/api/v1/crates/${name}`, 'crates.io のクレート');
			return {
				site: 'crates.io', title: crate.name, description: crate.description, accent: '#e57300',
				badges: [{ text: `v${crate.max_stable_version ?? crate.newest_version}` }, { text: `↓ ${formatCount(crate.downloads)}` }, ...(crate.recent_downloads != null ? [{ text: `直近90日 ${formatCount(crate.recent_downloads)}` }] : [])],
			};
		},
	};
}

function dockerTarget(ctx: NoteCommandContext, raw: string): Target {
	const path = raw.trim().replace(/^https:\/\/hub\.docker\.com\/(?:r\/|_\/)/, '').replace(/\/$/, '');
	const [namespace, repository] = path.includes('/') ? path.split('/') : ['library', path];
	if (!/^[\w.-]+$/.test(namespace) || !/^[\w.-]+$/.test(repository ?? '')) throw new NoteCommandError(`Docker Hub のイメージ名が正しくありません: ${raw}`);
	return {
		url: async () => namespace === 'library' ? `https://hub.docker.com/_/${repository}` : `https://hub.docker.com/r/${namespace}/${repository}`,
		defaultStyle: 'card',
		ogImage: async () => null,
		card: async () => {
			const image = await fetchJson<{ description: string | null; star_count: number; pull_count: number }>(ctx, `https://hub.docker.com/v2/repositories/${namespace}/${repository}/`, 'Docker Hub のイメージ');
			return {
				site: 'Docker Hub', title: namespace === 'library' ? repository : `${namespace}/${repository}`, description: image.description, accent: '#1d63ed',
				badges: [{ text: `★ ${formatCount(image.star_count)}` }, { text: `pull ${formatCount(image.pull_count)}` }],
			};
		},
	};
}

function metaContent(html: string, property: string): string | null {
	const tag = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]*>`, 'i').exec(html)?.[0];
	const content = tag != null ? /content=["']([^"']*)["']/i.exec(tag)?.[1] : null;
	return content != null ? content.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : null;
}

function ogpTarget(ctx: NoteCommandContext, raw: string): Target {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		throw new NoteCommandError('URL を書いてください');
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new NoteCommandError('http か https の URL を書いてください');
	// fetchText goes through HttpRequestService, which refuses private addresses, the same as URL previews.
	const page = () => fetchText(ctx, url.href, 'ページ', { headers: { Accept: 'text/html' } });
	return {
		url: async () => url.href,
		defaultStyle: 'ogp',
		ogImage: async () => {
			const image = metaContent(await page(), 'og:image');
			return image ? new URL(image, url).href : null;
		},
		card: async () => {
			const html = await page();
			const title = metaContent(html, 'og:title') ?? /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? url.href;
			return {
				site: metaContent(html, 'og:site_name') ?? url.hostname, title, description: metaContent(html, 'og:description') ?? metaContent(html, 'description'),
				accent: CARD_COLORS.neutral, badges: [],
			};
		},
	};
}

export function detectSource(raw: string): Source {
	const text = raw.trim();
	if (/^https:\/\/(?:gist\.)?github\.com\//.test(text)) return 'gh';
	if (/^https:\/\/www\.npmjs\.com\/package\//.test(text)) return 'npm';
	if (/^https:\/\/pypi\.org\/project\//.test(text)) return 'pypi';
	if (/^https:\/\/crates\.io\/crates\//.test(text)) return 'crates';
	if (/^https:\/\/hub\.docker\.com\/(?:r|_)\//.test(text)) return 'docker';
	if (/^https?:\/\//.test(text)) return 'ogp';
	throw new NoteCommandError('URL を書くか、card.gh や card.npm のように種類を指定してください');
}

async function toAttachment(ctx: NoteCommandContext, imageUrl: string, alt: string): Promise<GeneratedFile> {
	const original = await fetchImage(ctx, imageUrl, 'プレビュー画像');
	let image;
	try {
		image = sharp(original, { animated: false }).resize({ width: 1200, withoutEnlargement: true });
		const { hasAlpha } = await image.metadata();
		const data = hasAlpha ? await image.png().toBuffer() : await image.jpeg({ quality: 85 }).toBuffer();
		return { name: hasAlpha ? 'card.png' : 'card.jpg', type: hasAlpha ? 'image/png' : 'image/jpeg', data, comment: alt };
	} catch {
		throw new NoteCommandError('プレビュー画像を読み込めませんでした');
	}
}

async function runCard(source: Source, main: string, style: Style | null, ctx: NoteCommandContext): Promise<NoteCommandOutput> {
	const target = source === 'gh' ? githubTarget(ctx, parseGitHubTarget(main))
		: source === 'npm' ? npmTarget(ctx, main)
		: source === 'pypi' ? pypiTarget(ctx, main)
		: source === 'crates' ? cratesTarget(ctx, main)
		: source === 'docker' ? dockerTarget(ctx, main)
		: ogpTarget(ctx, main);
	const fetchedOn = formatDateIn(ctx.now, ctx.prefs.timezone);
	const url = await target.url();
	const chosen = style ?? target.defaultStyle;

	if (chosen === 'ogp') {
		const imageUrl = await target.ogImage();
		if (imageUrl == null && style === 'ogp') throw new NoteCommandError('このページにはプレビュー画像がありません。style:card を試してください');
		if (imageUrl != null) {
			// Alt text comes from the card data when it can be fetched, so the image is still described.
			const card = await target.card().catch(() => null);
			const alt = card != null ? describeCard({ ...card, fetchedOn }) : `${url} のプレビュー画像 (取得: ${fetchedOn})`;
			return { text: url, files: [await toAttachment(ctx, imageUrl, alt)] };
		}
	}
	const card = { ...await target.card(), fetchedOn };
	return { text: url, files: [await svgToFile(renderCardSvg(card), 'card.png', describeCard(card))] };
}

function cardCommand(name: string, source: Source | null): NoteCommandSpec {
	return {
		name,
		main: 'rest',
		options: ['style'],
		async run(input, ctx) {
			const main = requireMain(input, source == null ? '%%card https://github.com/owner/repo%%' : `%%${name} …%%`);
			const style = input.options.has('style') ? enumOption(input, 'style', ['ogp', 'card'], 'card') : null;
			return await runCard(source ?? detectSource(main), main, style, ctx);
		},
	};
}

export const cardCommands: NoteCommandSpec[] = [
	cardCommand('card', null),
	...(['gh', 'npm', 'pypi', 'crates', 'docker', 'ogp'] as const).map(source => cardCommand(`card.${source}`, source)),
];
