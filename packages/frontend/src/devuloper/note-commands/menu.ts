/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineAsyncComponent, nextTick } from 'vue';
import * as os from '@/os.js';
import type { MenuItem } from '@/types/menu.js';
import type { Form, FormItem } from '@/utility/form.js';
import { loadPrefs, previewNoteCommands, savePrefs } from './api.js';
import { COMMANDS, buildSyntax } from './catalog.js';
import type { CommandDef, CommandField } from './catalog.js';

type Selection = { start: number; end: number; text: string };

function toFormItem(field: CommandField, selection: Selection): FormItem {
	const fromSelection = field.fromSelection && selection.text !== '' ? selection.text : null;
	switch (field.type) {
		case 'boolean':
			return { type: 'boolean', label: field.label, default: field.default === true };
		case 'enum':
			return { type: 'enum', label: field.label, enum: field.enum ?? [], default: typeof field.default === 'string' ? field.default : null, required: true };
		default:
			return {
				type: 'string',
				label: field.label,
				description: field.description,
				multiline: field.multiline,
				required: field.required,
				default: fromSelection ?? (typeof field.default === 'string' ? field.default : null),
			};
	}
}

async function confirmWithPreview(syntax: string): Promise<boolean> {
	let result: Awaited<ReturnType<typeof previewNoteCommands>>;
	try {
		result = await os.promiseDialog(previewNoteCommands(syntax), null, null, '実行しています');
	} catch (err) {
		await os.alert({ type: 'error', text: (err as { message?: string }).message ?? String(err) });
		return false;
	}
	return new Promise(resolve => {
		let done = false;
		const { dispose } = os.popup(defineAsyncComponent(() => import('./NoteCommandPreview.vue')), { syntax, result }, {
			done: () => {
				done = true;
			},
			closed: () => {
				dispose();
				resolve(done);
			},
		});
	});
}

async function runCommand(def: CommandDef, selection: Selection, insert: (syntax: string, replaceSelection: boolean) => void) {
	let values: Record<string, unknown> = {};
	if (def.fields.length > 0) {
		const form: Form = Object.fromEntries(def.fields.map(field => [field.key, toFormItem(field, selection)]));
		const { canceled, result } = await os.form(def.label, form);
		if (canceled) return;
		values = result;
	}
	const syntax = buildSyntax(def, values);
	if (def.preview && !await confirmWithPreview(syntax)) return;

	const usedSelection = def.fields.some(field => field.fromSelection && values[field.key] === selection.text);
	insert(syntax, usedSelection && selection.text !== '');
}

async function openSettings() {
	const prefs = await loadPrefs();
	const { canceled, result } = await os.form('ノート用コマンドの設定', {
		timezone: {
			type: 'string',
			label: 'タイムゾーン',
			description: '%%time%% の入力と %%stats%% の集計に使います。例: Asia/Tokyo',
			default: prefs.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
		},
		timeZones: {
			type: 'string',
			label: '%%time%% で並べるタイムゾーン (| 区切り)',
			default: (prefs.timeZones ?? ['UTC', 'America/Los_Angeles', 'America/New_York', 'Europe/London']).join('|'),
		},
		weekStart: {
			type: 'enum',
			label: '週の始まり',
			enum: [{ label: '月曜日', value: 'mon' }, { label: '日曜日', value: 'sun' }],
			default: prefs.weekStart ?? 'mon',
		},
		githubUsername: {
			type: 'string',
			label: 'GitHub のユーザー名',
			description: '%%contrib%% でユーザー名を省略したときに使います',
			default: prefs.githubUsername ?? '',
		},
	});
	if (canceled) return;
	await os.promiseDialog(savePrefs({
		timezone: result.timezone?.trim() || undefined,
		timeZones: (result.timeZones ?? '').split(/[|｜]/).map(zone => zone.trim()).filter(zone => zone !== ''),
		weekStart: result.weekStart as 'mon' | 'sun',
		githubUsername: result.githubUsername?.trim() || null,
	}));
}

/**
 * Opens the fork's command menu for the post form. The chosen command is inserted as `%%…%%` syntax,
 * which the server runs when the note is posted, so the button and third-party clients share one path.
 * When a command takes text, the selected text is offered as its input and replaced by the syntax.
 *
 * @example
 * <button @click="ev => openNoteCommandMenu(ev.currentTarget, textareaEl, () => text, value => text = value)">
 */
export function openNoteCommandMenu(anchor: EventTarget | null, textarea: HTMLTextAreaElement | null, getText: () => string, setText: (value: string) => void) {
	const current = getText();
	const start = textarea?.selectionStart ?? current.length;
	const end = textarea?.selectionEnd ?? current.length;
	const selection: Selection = { start, end, text: current.slice(start, end) };

	const insert = (syntax: string, replaceSelection: boolean) => {
		const from = replaceSelection ? selection.start : selection.end;
		// The text may have changed while the dialogs were open, so read it again.
		const latest = getText();
		setText(latest.slice(0, from) + syntax + latest.slice(selection.end));
		const caret = from + syntax.length;
		nextTick(() => {
			textarea?.focus();
			textarea?.setSelectionRange(caret, caret);
		});
	};
	const toItem = (def: CommandDef): MenuItem => ({ text: def.label, icon: def.icon, action: () => runCommand(def, selection, insert) });
	const fonts = COMMANDS.filter(def => def.name.startsWith('font.'));

	os.popupMenu([
		{ type: 'label', text: 'ノート用コマンド' },
		{ type: 'parent', text: '装飾文字', icon: 'ti ti-typography', children: fonts.map(toItem) },
		...COMMANDS.filter(def => def.group === 'text' && !def.name.startsWith('font.')).map(toItem),
		{ type: 'parent', text: 'ランダム', icon: 'ti ti-dice', children: COMMANDS.filter(def => def.group === 'random').map(toItem) },
		{ type: 'divider' },
		{ text: '設定', icon: 'ti ti-settings', action: openSettings },
	], anchor);
}
