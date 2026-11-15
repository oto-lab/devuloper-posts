<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!-- Fork-only (oto-lab/devuloper-posts): shows what a `%%command%%` will become before it is inserted. -->
<template>
<MkModalWindow
	ref="dialog"
	:width="500"
	:height="600"
	:withOkButton="true"
	@ok="insert"
	@close="dialog?.close()"
	@closed="emit('closed')"
>
	<template #header>プレビュー</template>
	<div class="_spacer _gaps_m">
		<code :class="$style.syntax">{{ syntax }}</code>
		<div v-if="result.text !== ''" :class="$style.text"><Mfm :text="result.text" :plain="false"/></div>
		<figure v-for="file in result.files" :key="file.dataUrl" :class="$style.file">
			<img :src="file.dataUrl" :alt="file.comment" :class="$style.image"/>
			<figcaption :class="$style.caption">{{ file.comment }}</figcaption>
		</figure>
		<div :class="$style.note">投稿するときにサーバーがもう一度実行するので、時刻や外部のデータは変わることがあります。</div>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { useTemplateRef } from 'vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import type { PreviewResult } from './api.js';

defineProps<{
	syntax: string;
	result: PreviewResult;
}>();

const emit = defineEmits<{
	(ev: 'done'): void;
	(ev: 'closed'): void;
}>();

const dialog = useTemplateRef('dialog');

function insert() {
	emit('done');
	dialog.value?.close();
}
</script>

<style lang="scss" module>
.syntax {
	display: block;
	padding: 8px 12px;
	border-radius: 6px;
	background: var(--MI_THEME-bg);
	white-space: pre-wrap;
	word-break: break-all;
	font-size: 0.85em;
}

.text {
	white-space: pre-wrap;
}

.file {
	margin: 0;
}

.image {
	display: block;
	max-width: 100%;
	border-radius: 6px;
}

.caption {
	margin-top: 4px;
	font-size: 0.8em;
	opacity: 0.7;
	white-space: pre-wrap;
}

.note {
	font-size: 0.8em;
	opacity: 0.7;
}
</style>
