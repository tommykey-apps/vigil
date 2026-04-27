<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	const { form }: PageProps = $props();
</script>

<header class="p-8 pb-4">
	<a href="/" class="text-sm underline text-muted-foreground">← ダッシュボード</a>
	<h1 class="text-2xl font-bold mt-2">ドメインを追加</h1>
</header>

<main class="px-8">
	<form method="POST" use:enhance class="flex flex-col gap-3 max-w-md">
		<label class="flex flex-col gap-1">
			<span class="text-sm">hostname</span>
			<input
				name="hostname"
				type="text"
				required
				placeholder="example.com"
				value={form?.hostname ?? ''}
				class="border rounded px-3 py-2 font-mono"
			/>
		</label>
		{#if form?.error}
			<p class="text-sm text-red-600">{form.error}</p>
		{/if}
		<button class="border rounded px-3 py-2 bg-black text-white hover:bg-gray-800">登録する</button>
	</form>
	<p class="text-xs text-muted-foreground mt-4 max-w-md">
		登録後に表示される TXT レコードを <code>_vigil-challenge.&lt;hostname&gt;</code> に設定し、
		propagation 後に「Verify」ボタンを押してください。
	</p>
</main>
