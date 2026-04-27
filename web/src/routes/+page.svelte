<script lang="ts">
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
</script>

<header class="flex items-baseline justify-between p-8 pb-4">
	<h1 class="text-2xl font-bold">vigil</h1>
	<div class="flex items-center gap-4 text-sm">
		<span class="text-muted-foreground">@{data.user?.login}</span>
		<form method="POST" action="/auth/logout">
			<button class="underline">logout</button>
		</form>
	</div>
</header>

<main class="px-8">
	<section class="flex items-center justify-between mb-4">
		<h2 class="text-lg font-semibold">ドメイン</h2>
		<a href="/domains/new" class="border rounded px-3 py-1 hover:bg-gray-50">+ 追加</a>
	</section>

	{#if data.domains.length === 0}
		<p class="text-sm text-muted-foreground">
			まだドメインが登録されていません。<a href="/domains/new" class="underline">登録する</a> と
			WHOIS / SSL / DNS の監視を始めます。
		</p>
	{:else}
		<ul class="divide-y border rounded">
			{#each data.domains as d (d.hostname)}
				<li class="flex items-center justify-between px-4 py-3">
					<a href="/domains/{encodeURIComponent(d.hostname)}" class="font-mono">{d.hostname}</a>
					{#if d.verified_at}
						<span class="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800">verified</span>
					{:else}
						<span class="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-800"
							>verify pending</span
						>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</main>
