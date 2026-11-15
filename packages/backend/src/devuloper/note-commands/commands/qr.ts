/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import QRCode from 'qrcode';
import { NoteCommandError, enumOption, flagOption, intOption, requireMain } from '../types.js';
import type { NoteCommandSpec } from '../types.js';

/** Byte mode at the lowest error correction holds 2,953 bytes; leave room for the higher levels. */
const MAX_CONTENT_LENGTH = 1500;

export const qr: NoteCommandSpec = {
	name: 'qr',
	main: 'rest',
	options: ['hide', 'size', 'ecc'],
	async run(input) {
		const content = requireMain(input, '%%qr https://example.com%%');
		if (content.length > MAX_CONTENT_LENGTH) throw new NoteCommandError(`中身は ${MAX_CONTENT_LENGTH} 文字までです`);
		const hide = flagOption(input, 'hide');
		const size = intOption(input, 'size', { min: 128, max: 1024, fallback: 512 });
		const ecc = enumOption(input, 'ecc', ['l', 'm', 'q', 'h'], 'm');

		let data: Buffer;
		try {
			data = await QRCode.toBuffer(content, { type: 'png', width: size, margin: 2, errorCorrectionLevel: ecc.toUpperCase() as QRCode.QRCodeErrorCorrectionLevel });
		} catch {
			throw new NoteCommandError('QR コードに入りきりません。中身を短くするか ecc:L を試してください');
		}
		return {
			text: hide ? '' : content,
			// The alt text would give away a hidden message, so it only says what the image is.
			files: [{ name: 'qr.png', type: 'image/png', data, comment: hide ? 'QR コード' : `QR コード: ${content}` }],
		};
	},
};
