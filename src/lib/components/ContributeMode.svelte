<script lang="ts">
	// "Contribute" flow on a map page: invite code → pick point/line/area → draw →
	// fill the form → POST /api/contribute. Saved features are pending until reviewed.
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';
	import type { Map as MapLibreMap, GeoJSONSource } from 'maplibre-gl';
	import {
		TerraDraw,
		TerraDrawPointMode,
		TerraDrawLineStringMode,
		TerraDrawPolygonMode
	} from 'terra-draw';
	import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
	import { contributing } from '$lib/contribute/state.svelte';
	import {
		classesFor,
		validateSubmission,
		LIMITS,
		type ContributeConfig,
		type GeomKind
	} from '$lib/contribute/validate';

	let { map, config, slug }: { map: MapLibreMap; config: ContributeConfig; slug: string } = $props();

	const taxonomy = $derived(config.taxonomyData!);
	const TOKEN_KEY = `pgsl-contrib-token:${slug}`;
	const AUTHOR_KEY = 'pgsl-contrib-author';
	const MODES: Record<GeomKind, string> = { point: 'point', line: 'linestring', polygon: 'polygon' };
	const KIND_LABEL: Record<GeomKind, string> = { point: 'Point', line: 'Line', polygon: 'Area' };
	const HINTS: Record<GeomKind, string> = {
		point: 'Tap the map to place a point.',
		line: 'Tap to add points. Tap the last point again to finish.',
		polygon: 'Tap to add corners. Tap the first corner to close the area.'
	};

	type Step = 'idle' | 'code' | 'choose' | 'drawing' | 'form' | 'done';
	let step = $state<Step>('idle');
	let kind = $state<GeomKind>('polygon');
	let token = $state('');
	let codeInput = $state('');
	let geometry = $state<any>(null);
	let message = $state('');
	let sending = $state(false);

	// form fields
	let oneClass = $state('');
	let subtype = $state('');
	let oneState = $state('');
	let localName = $state('');
	let notes = $state('');
	let author = $state('');
	let website = $state(''); // honeypot

	const classOptions = $derived(classesFor(taxonomy, kind));
	const subtypeOptions = $derived(oneClass ? Object.entries(taxonomy.classes[oneClass]?.subtypes ?? {}) : []);
	const stateOptions = $derived(Object.entries(taxonomy.states ?? {}));

	let draw: TerraDraw | null = null;

	function storage(kind: 'session' | 'local') {
		try {
			return kind === 'session' ? window.sessionStorage : window.localStorage;
		} catch {
			return null;
		}
	}

	function ensureDraw() {
		if (draw) return draw;
		draw = new TerraDraw({
			adapter: new TerraDrawMapLibreGLAdapter({ map }),
			modes: [new TerraDrawPointMode(), new TerraDrawLineStringMode(), new TerraDrawPolygonMode()]
		});
		draw.start();
		draw.on('finish', (id) => {
			const f = draw?.getSnapshotFeature(id);
			if (!f) return;
			geometry = f.geometry;
			draw?.setMode('static');
			message = '';
			step = 'form';
		});
		return draw;
	}

	function start() {
		message = '';
		const fromUrl = page.url.searchParams.get('t');
		const saved = storage('session')?.getItem(TOKEN_KEY);
		token = (fromUrl || saved || '').trim();
		if (fromUrl) storage('session')?.setItem(TOKEN_KEY, fromUrl.trim());
		author = storage('local')?.getItem(AUTHOR_KEY) ?? '';
		contributing.active = true;
		step = token ? 'choose' : 'code';
	}

	function saveCode(e: SubmitEvent) {
		e.preventDefault();
		const code = codeInput.trim().toUpperCase();
		if (!code) return;
		token = code;
		storage('session')?.setItem(TOKEN_KEY, code);
		codeInput = '';
		step = 'choose';
	}

	function beginDrawing(k: GeomKind) {
		kind = k;
		geometry = null;
		oneClass = '';
		subtype = '';
		const d = ensureDraw();
		d.clear();
		d.setMode(MODES[k]);
		step = 'drawing';
	}

	function redraw() {
		beginDrawing(kind);
	}

	function stop() {
		draw?.clear();
		draw?.setMode('static');
		geometry = null;
		contributing.active = false;
		step = 'idle';
	}

	function refreshPending() {
		const id = config.pending_layer;
		if (!id) return;
		const src = map.getSource(id) as GeoJSONSource | undefined;
		const data = (src?.serialize() as any)?.data;
		if (typeof data === 'string') {
			const url = data.replace(/([?&])_=\d+/, '$1').replace(/[?&]$/, '');
			src!.setData(url + (url.includes('?') ? '&' : '?') + '_=' + Date.now());
		}
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		const body = {
			slug,
			token,
			geometry,
			one_class: oneClass,
			subtype: subtype || null,
			one_state: oneState || null,
			local_name: localName,
			notes,
			author_name: author,
			website
		};
		const check = validateSubmission(body, taxonomy, config.bounds);
		if (!check.ok) {
			message = check.error;
			return;
		}
		sending = true;
		message = '';
		try {
			const res = await fetch('/api/contribute', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			const out = await res.json().catch(() => ({}));
			if (res.ok) {
				storage('local')?.setItem(AUTHOR_KEY, author.trim());
				draw?.clear();
				geometry = null;
				localName = '';
				notes = '';
				oneState = '';
				step = 'done';
				refreshPending();
				return;
			}
			message = out?.message ?? 'Could not save, please try again.';
			if (res.status === 403) {
				// bad or expired invite code: ask again, keep the drawing
				storage('session')?.removeItem(TOKEN_KEY);
				token = '';
			}
		} catch {
			message = 'No connection. Please try again.';
		} finally {
			sending = false;
		}
	}

	onDestroy(() => {
		contributing.active = false;
		try {
			draw?.stop();
		} catch {
			/* map may already be gone */
		}
	});

	const inputClass =
		'w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-pink-600 focus:outline-none';
	const btn = 'rounded px-3 py-1.5 text-sm font-medium shadow-sm';
</script>

<!-- Entry button / toolbar, floating over the map -->
<div class="fixed top-3 right-14 z-40 flex max-w-[calc(100vw-4.5rem)] flex-col items-end gap-2">
	{#if step === 'idle'}
		<button class="{btn} bg-pink-600 text-white hover:bg-pink-700" onclick={start}>+ Contribute</button>
	{:else if step === 'choose' || step === 'drawing'}
		<div class="flex flex-wrap items-center justify-end gap-1 rounded bg-white/95 p-1.5 shadow">
			<span class="px-1 text-xs text-gray-600">Map a</span>
			{#each Object.keys(MODES) as k (k)}
				<button
					class="{btn} {step === 'drawing' && kind === k
						? 'bg-pink-600 text-white'
						: 'bg-gray-100 hover:bg-gray-200'}"
					onclick={() => beginDrawing(k as GeomKind)}>{KIND_LABEL[k as GeomKind]}</button
				>
			{/each}
			<button class="{btn} bg-white text-gray-600 hover:bg-gray-100" onclick={stop}>Cancel</button>
		</div>
		<p class="rounded bg-white/95 px-2 py-1 text-xs text-gray-700 shadow">
			{step === 'drawing' ? HINTS[kind] : 'Choose what to draw.'}
		</p>
	{/if}
</div>

<!-- Dialogs: centred card on desktop, bottom sheet on phones -->
{#if step === 'code' || step === 'form' || step === 'done'}
	<div class="fixed inset-0 z-[1100] flex items-end justify-center bg-black/30 md:items-center">
		<div
			class="max-h-[85svh] w-full overflow-y-auto rounded-t-xl bg-white p-4 shadow-xl md:max-w-md md:rounded-xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="contrib-title"
		>
			{#if step === 'code'}
				<h2 id="contrib-title" class="mb-1 text-lg font-semibold">Invite code</h2>
				<p class="mb-3 text-sm text-gray-600">
					Contributions need an invite code from the project team. It's in your invite link or QR code.
				</p>
				<form onsubmit={saveCode} class="flex flex-col gap-3">
					<input class={inputClass} bind:value={codeInput} placeholder="e.g. K7Q2BIDAR9XA" autocomplete="off" />
					<div class="flex justify-end gap-2">
						<button type="button" class="{btn} bg-gray-100" onclick={stop}>Cancel</button>
						<button type="submit" class="{btn} bg-pink-600 text-white">Continue</button>
					</div>
				</form>
			{:else if step === 'form'}
				<h2 id="contrib-title" class="mb-1 text-lg font-semibold">Describe this {KIND_LABEL[kind].toLowerCase()}</h2>
				<p class="mb-3 text-xs text-gray-500">It will appear on the map after review.</p>
				<form onsubmit={submit} class="flex flex-col gap-3">
					<label class="flex flex-col gap-1 text-sm">
						<span>Feature class *</span>
						<select class={inputClass} bind:value={oneClass} onchange={() => (subtype = '')} required>
							<option value="" disabled>Choose…</option>
							{#each classOptions as [key, c] (key)}
								<option value={key}>{c.label}</option>
							{/each}
						</select>
					</label>
					{#if subtypeOptions.length}
						<label class="flex flex-col gap-1 text-sm">
							<span>Type</span>
							<select class={inputClass} bind:value={subtype}>
								<option value="">Not sure</option>
								{#each subtypeOptions as [key, s] (key)}
									<option value={key}>{s.label}</option>
								{/each}
							</select>
						</label>
					{/if}
					{#if stateOptions.length}
						<label class="flex flex-col gap-1 text-sm">
							<span>Condition</span>
							<select class={inputClass} bind:value={oneState}>
								<option value="">Not sure</option>
								{#each stateOptions as [key, label] (key)}
									<option value={key}>{label}</option>
								{/each}
							</select>
						</label>
					{/if}
					<label class="flex flex-col gap-1 text-sm">
						<span>Local name</span>
						<input class={inputClass} bind:value={localName} maxlength={LIMITS.local} placeholder="Name used locally, if any" />
					</label>
					<label class="flex flex-col gap-1 text-sm">
						<span>Notes</span>
						<textarea class={inputClass} rows="3" bind:value={notes} maxlength={LIMITS.notes}></textarea>
					</label>
					<label class="flex flex-col gap-1 text-sm">
						<span>Your name *</span>
						<input class={inputClass} bind:value={author} maxlength={LIMITS.author} required autocomplete="name" />
						<span class="text-xs text-gray-500">Shown as the author on the map once approved.</span>
					</label>
					<!-- honeypot: hidden from people, filled in by bots -->
					<input class="hidden" tabindex="-1" autocomplete="off" aria-hidden="true" bind:value={website} name="website" />

					{#if !token}
						<label class="flex flex-col gap-1 text-sm">
							<span>Invite code *</span>
							<input
								class={inputClass}
								value={token}
								oninput={(e) => {
									token = e.currentTarget.value.trim().toUpperCase();
									storage('session')?.setItem(TOKEN_KEY, token);
								}}
								required
							/>
						</label>
					{/if}

					{#if message}
						<p class="rounded bg-red-50 px-2 py-1.5 text-sm text-red-700" role="alert">{message}</p>
					{/if}
					<div class="flex flex-wrap justify-end gap-2">
						<button type="button" class="{btn} bg-gray-100" onclick={stop} disabled={sending}>Discard</button>
						<button type="button" class="{btn} bg-gray-100" onclick={redraw} disabled={sending}>Redraw</button>
						<button type="submit" class="{btn} bg-pink-600 text-white disabled:opacity-60" disabled={sending}>
							{sending ? 'Saving…' : 'Submit'}
						</button>
					</div>
				</form>
			{:else}
				<h2 id="contrib-title" class="mb-1 text-lg font-semibold">Thank you!</h2>
				<p class="mb-3 text-sm text-gray-600">
					Your contribution is saved and will appear on the map after review.
				</p>
				<div class="flex justify-end gap-2">
					<button class="{btn} bg-gray-100" onclick={stop}>Done</button>
					<button class="{btn} bg-pink-600 text-white" onclick={() => (step = 'choose')}>Map another</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
