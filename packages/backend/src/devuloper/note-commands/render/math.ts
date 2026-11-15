/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { NoteCommandError } from '../types.js';

const EX_TO_PX = 18;
const PADDING = 28;

type MathDocument = { convert: (math: string, options: { display: boolean }) => unknown };

let document: { adaptor: ReturnType<typeof liteAdaptor>; doc: MathDocument } | null = null;

function getDocument() {
	if (document == null) {
		const adaptor = liteAdaptor();
		RegisterHTMLHandler(adaptor);
		const doc = mathjax.document('', {
			// Throw instead of drawing the error in red, so the poster gets a message.
			InputJax: new TeX({ packages: AllPackages, formatError: (_jax: unknown, err: unknown) => { throw err; } }),
			OutputJax: new SVG({ fontCache: 'local' }),
		}) as unknown as MathDocument;
		document = { adaptor, doc };
	}
	return document;
}

/** Renders TeX as a standalone SVG on a white background. */
export function renderMathSvg(tex: string, display: boolean): string {
	const { adaptor, doc } = getDocument();
	let inner: string;
	try {
		inner = adaptor.innerHTML(doc.convert(tex, { display }) as never);
	} catch (err) {
		// MathJax throws TexError, which is not an Error subclass but carries a message.
		const message = typeof err === 'object' && err != null && 'message' in err ? String(err.message) : String(err);
		throw new NoteCommandError(`数式を読めません: ${message}`);
	}

	// MathJax sizes the SVG in ex units, which librsvg cannot resolve without a surrounding font.
	const exWidth = Number(/width="([\d.]+)ex"/.exec(inner)?.[1] ?? 10);
	const exHeight = Number(/height="([\d.]+)ex"/.exec(inner)?.[1] ?? 3);
	const width = Math.ceil(exWidth * EX_TO_PX);
	const height = Math.ceil(exHeight * EX_TO_PX);
	const sized = inner.replace(/width="[\d.]+ex"/, `width="${width}"`).replace(/height="[\d.]+ex"/, `height="${height}"`).replace(/style="[^"]*"/, '');
	const outerWidth = width + PADDING * 2;
	const outerHeight = height + PADDING * 2;
	return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${outerWidth}" height="${outerHeight}" viewBox="0 0 ${outerWidth} ${outerHeight}" color="#1f2328"><rect width="${outerWidth}" height="${outerHeight}" fill="#ffffff"/><g transform="translate(${PADDING},${PADDING})">${sized}</g></svg>`;
}
