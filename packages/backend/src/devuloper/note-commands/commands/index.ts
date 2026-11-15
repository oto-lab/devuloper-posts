/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { banner } from './banner.js';
import { calc } from './calc.js';
import { chartCommands } from './chart.js';
import { fontCommands } from './font.js';
import { img } from './img.js';
import { progress } from './progress.js';
import { qr } from './qr.js';
import { randChoose, randDice, randNum, randOmikuji } from './rand.js';
import { stats } from './stats.js';
import { time } from './time.js';
import { unit } from './unit.js';
import type { NoteCommandSpec } from '../types.js';

export const NOTE_COMMANDS: readonly NoteCommandSpec[] = [
	banner,
	calc,
	...chartCommands,
	...fontCommands,
	img,
	progress,
	qr,
	randChoose,
	randDice,
	randNum,
	randOmikuji,
	stats,
	time,
	unit,
];
