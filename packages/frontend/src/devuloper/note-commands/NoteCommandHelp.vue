<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!-- Fork-only (oto-lab/devuloper-posts): lists every `%%command%%` with how to write it by hand. -->
<template>
<MkModalWindow
	ref="dialog"
	:width="560"
	:height="700"
	@close="dialog?.close()"
	@closed="emit('closed')"
>
	<template #header>ノート用コマンドの使い方</template>
	<div class="_spacer _gaps_m">
		<div :class="$style.intro">
			本文に <code>%%コマンド ...%%</code> と書くと、投稿するときにサーバーが結果に置き換えます。ほかのクライアントからでも使えます。<code>[ ]</code> は省略できるオプションです。
			<a :href="DOCS_URL" target="_blank" rel="noopener" class="_link">詳しい説明 <i class="ti ti-external-link"></i></a>
		</div>
		<section v-for="group in groups" :key="group.id" class="_gaps_s">
			<div :class="$style.groupLabel">{{ GROUP_LABELS[group.id] }}</div>
			<div v-for="def in group.commands" :key="def.name" :class="$style.command">
				<div :class="$style.label"><i :class="def.icon"></i> {{ def.label }}</div>
				<code :class="$style.syntax">{{ describeSyntax(def) }}</code>
				<div v-if="def.description" :class="$style.description">{{ def.description }}</div>
			</div>
		</section>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { useTemplateRef } from 'vue';
import { COMMANDS, DOCS_URL, GROUP_LABELS, describeSyntax } from './catalog.js';
import type { CommandDef } from './catalog.js';
import MkModalWindow from '@/components/MkModalWindow.vue';

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const dialog = useTemplateRef('dialog');

const groups = (Object.keys(GROUP_LABELS) as CommandDef['group'][]).map(id => ({ id, commands: COMMANDS.filter(def => def.group === id) }));
</script>

<style lang="scss" module>
.intro {
	font-size: 0.9em;
	line-height: 1.6;
}

.groupLabel {
	font-weight: bold;
	opacity: 0.7;
}

.command {
	padding: 10px 12px;
	border-radius: 8px;
	background: var(--MI_THEME-bg);
}

.label {
	font-weight: bold;
}

.syntax {
	display: block;
	margin-top: 4px;
	font-size: 0.85em;
	white-space: pre-wrap;
	word-break: break-all;
}

.description {
	margin-top: 4px;
	font-size: 0.85em;
	opacity: 0.8;
}
</style>
