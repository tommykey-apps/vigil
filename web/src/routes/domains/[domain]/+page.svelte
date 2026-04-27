<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	const { data, form }: PageProps = $props();
</script>

<header class="p-8 pb-4">
	<a href="/" class="text-sm underline text-muted-foreground">← ダッシュボード</a>
	<h1 class="text-2xl font-bold mt-2 font-mono">{data.domain.hostname}</h1>
</header>

<main class="px-8 flex flex-col gap-6 max-w-2xl">
	{#if data.domain.verified_at}
		<section class="flex items-center gap-3">
			<span class="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800">verified</span>
			<span class="text-sm text-muted-foreground"
				>at {new Date(data.domain.verified_at * 1000).toISOString()}</span
			>
		</section>
	{:else}
		<section>
			<h2 class="text-lg font-semibold mb-2">DNS TXT 所有確認</h2>
			<p class="text-sm text-muted-foreground mb-3">
				以下の TXT レコードを設定し、propagation 後 (15〜60s 程度) に「Verify」を押してください。
			</p>
			<pre
				class="border rounded p-3 bg-gray-50 text-xs font-mono whitespace-pre overflow-x-auto">Name:  _vigil-challenge.{data.domain.hostname}
Type:  TXT
Value: vigil-verify={data.domain.verify_token}</pre>
			{#if data.domain.verify_token_expires_at}
				<p class="text-xs text-muted-foreground mt-2">
					token 有効期限: {new Date(data.domain.verify_token_expires_at * 1000).toLocaleString()}
				</p>
			{/if}
			<div class="flex gap-3 mt-4">
				<form method="POST" action="?/verify" use:enhance>
					<button class="border rounded px-3 py-1 bg-black text-white hover:bg-gray-800"
						>Verify</button
					>
				</form>
				{#if form && 'expired' in form && form.expired}
					<form method="POST" action="?/regen" use:enhance>
						<button class="border rounded px-3 py-1 hover:bg-gray-50">token 再発行</button>
					</form>
				{/if}
			</div>
			{#if form && 'error' in form && form.error}
				<p class="text-sm text-red-600 mt-3">{form.error}</p>
				{#if 'seen' in form && Array.isArray(form.seen) && form.seen.length > 0}
					<details class="text-xs text-muted-foreground mt-2">
						<summary>取得した TXT 値 ({form.seen.length} 件)</summary>
						<ul class="font-mono mt-1">
							{#each form.seen as v (v)}<li>{v}</li>{/each}
						</ul>
					</details>
				{/if}
			{/if}
			{#if form && 'regenerated' in form && form.regenerated}
				<p class="text-sm text-green-700 mt-3">
					新しい token を発行しました。再度 Verify してください。
				</p>
			{/if}
		</section>
	{/if}

	<section class="border-t pt-6">
		<h2 class="text-sm font-semibold text-red-700 mb-2">削除</h2>
		<p class="text-xs text-muted-foreground mb-3">
			このドメインを vigil の監視対象から外します (DNS 設定や WHOIS には影響しません)。
		</p>
		<form method="POST" action="?/delete" use:enhance>
			<button class="border border-red-300 text-red-700 rounded px-3 py-1 hover:bg-red-50"
				>Delete</button
			>
		</form>
	</section>
</main>
