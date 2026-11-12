/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { NoteCommandService } from './note-commands/NoteCommandService.js';

/**
 * Fork-only services, registered and exported by CoreModule through a single spread
 * so that adding one here never touches upstream files.
 */
export const devuloperProviders = [
	NoteCommandService,
];
