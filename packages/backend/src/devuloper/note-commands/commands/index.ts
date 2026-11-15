/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { banner } from './banner.js';
import { calc } from './calc.js';
import { fontCommands } from './font.js';
import { progress } from './progress.js';
import { randChoose, randDice, randNum, randOmikuji } from './rand.js';
import { time } from './time.js';
import { unit } from './unit.js';
import type { NoteCommandSpec } from '../types.js';

export const NOTE_COMMANDS: readonly NoteCommandSpec[] = [
	banner,
	calc,
	...fontCommands,
	progress,
	randChoose,
	randDice,
	randNum,
	randOmikuji,
	time,
	unit,
];
