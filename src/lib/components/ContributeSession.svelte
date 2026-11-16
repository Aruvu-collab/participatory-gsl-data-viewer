<script lang="ts">
	// Blueprint "title block" for the editing session: the invite code in use, its
	// session name, edits made with it, people editing with it now, and a reset button.
	// Shown on the right, under the Contribute toolbar, and in the form dialog.
	import { contributing } from '$lib/contribute/state.svelte';

	let { compact = false }: { compact?: boolean } = $props();

	const info = $derived(contributing.info);
	const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

	const validity = $derived.by(() => {
		if (!info?.valid) return '';
		const parts = [info.expires_at ? `until ${dateFmt.format(new Date(info.expires_at))}` : 'no expiry'];
		if (info.max_uses != null) parts.push(`${info.max_uses - (info.uses ?? 0)} of ${info.max_uses} uses left`);
		return parts.join(' · ');
	});
	const others = $derived(Math.max(0, (info?.live ?? 1) - 1));
</script>

<div class="bp-titleblock font-mono text-xs" aria-live="polite">
	<div class="bp-head">
		<span>Editing mode</span>
		<span class="bp-dot" aria-hidden="true"></span>
	</div>
	<dl>
		{#if info?.valid}
			<dt>Session</dt>
			<dd class="font-sans text-sm font-semibold" title={info.label}>{info.label}</dd>
		{/if}
		<dt>Code</dt>
		<dd class="flex flex-wrap items-center justify-between gap-2">
			<span class="whitespace-nowrap tracking-widest">{contributing.token}</span>
			<button type="button" class="bp-btn-ghost shrink-0 !px-2 !py-0.5 !text-xs" onclick={() => contributing.reset?.()}>
				Reset code
			</button>
		</dd>
		{#if contributing.checking && !info}
			<dt>Status</dt>
			<dd>Checking…</dd>
		{:else if info?.valid}
			<dt>Edits</dt>
			<dd>
				<span class="text-base font-bold">{info.edits ?? 0}</span>
				{#if info.edits}<span class="bp-muted">({info.pending ?? 0} pending · {info.approved ?? 0} approved)</span>{/if}
			</dd>
			<dt>Live</dt>
			<dd>
				<span class="text-base font-bold">{info.live ?? 1}</span>
				<span class="bp-muted">editing now{others ? ` · you + ${others}` : ' · just you'}</span>
			</dd>
			{#if !compact}
				<dt>Valid</dt>
				<dd class="bp-muted">{validity}</dd>
			{/if}
		{:else}
			<dt>Status</dt>
			<dd class="bp-muted">Couldn't check this code right now. It will be checked when you submit.</dd>
		{/if}
	</dl>
</div>
