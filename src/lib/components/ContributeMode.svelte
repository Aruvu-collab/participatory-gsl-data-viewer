<script lang="ts">
	// "Contribute" flow on a map page: invite code → pick point/line/area → draw →
	// fill the form → POST /api/contribute. Saved features are pending until reviewed.
	import { onDestroy } from 'svelte';
	import ContributeSession from './ContributeSession.svelte';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
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
		GEOM_TO_LAYER,
		type ContributeConfig,
		type GeomKind,
		type TokenInfo
	} from '$lib/contribute/validate';

	let { map, config, slug }: { map: MapLibreMap; config: ContributeConfig; slug: string } = $props();

	const taxonomy = $derived(config.taxonomyData!);
	const TOKEN_KEY = `pgsl-contrib-token:${slug}`;
	const AUTHOR_KEY = 'pgsl-contrib-author';
	const CLIENT_KEY = 'pgsl-contrib-client';
	const HEARTBEAT_MS = 30_000;
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
	let codeInput = $state('');
	let codeError = $state('');
	let afterCode = $state<Step>('choose'); // where to go once a working code is entered
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

	// Kinds this code may map (codes can be limited to some layers)
	const allowedKinds = $derived(
		(Object.keys(MODES) as GeomKind[]).filter(
			(k) => !contributing.info?.allowed_layers || contributing.info.allowed_layers.includes(GEOM_TO_LAYER[k])
		)
	);

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
			// pointerDistance (px) controls how close a click must be to an existing vertex
			// to snap/close onto it; TerraDraw's default of 40 is too aggressive for small features.
			modes: [
				new TerraDrawPointMode(),
				new TerraDrawLineStringMode({ pointerDistance: 12 }),
				new TerraDrawPolygonMode({ pointerDistance: 12 })
			]
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

	/** One id per browser tab, so the live-editor count can tell tabs apart. */
	function clientId(): string {
		let id = storage('session')?.getItem(CLIENT_KEY);
		if (!id) {
			id =
				typeof crypto !== 'undefined' && 'randomUUID' in crypto
					? crypto.randomUUID()
					: '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
							(+c ^ (Math.random() * 16) >> (+c / 4)).toString(16)
						);
			storage('session')?.setItem(CLIENT_KEY, id);
		}
		return id;
	}

	/**
	 * Look up a code without using it, and check this tab in as editing with it.
	 * Returns null if it couldn't be checked (offline, server down).
	 */
	async function checkToken(code: string): Promise<TokenInfo | null> {
		try {
			const res = await fetch('/api/contribute/token', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ slug, token: code, client: clientId() })
			});
			if (!res.ok) return null;
			return (await res.json()) as TokenInfo;
		} catch {
			return null;
		}
	}

	/** Tell the server this tab stopped editing with a code, so the live count drops at once. */
	function leave(code: string) {
		if (!code) return;
		const body = JSON.stringify({ slug, token: code, client: clientId(), leave: true });
		try {
			if (navigator.sendBeacon?.('/api/contribute/token', new Blob([body], { type: 'application/json' }))) return;
		} catch {
			/* fall through */
		}
		fetch('/api/contribute/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(
			() => {}
		);
	}

	function askForCode(reason: string, next: Step = 'choose') {
		codeError = reason;
		codeInput = '';
		afterCode = next;
		step = 'code';
	}

	async function start() {
		message = '';
		codeError = '';
		const fromUrl = page.url.searchParams.get('t')?.trim().toUpperCase();
		if (fromUrl) {
			// Take the code from the invite link once, then drop it from the address bar so a
			// reset or a newer code isn't overridden by the old link.
			storage('session')?.setItem(TOKEN_KEY, fromUrl);
			const url = new URL(page.url);
			url.searchParams.delete('t');
			replaceState(url, page.state);
		}
		contributing.token = storage('session')?.getItem(TOKEN_KEY) ?? '';
		contributing.info = null;
		contributing.reset = resetCode;
		author = storage('local')?.getItem(AUTHOR_KEY) ?? '';
		contributing.active = true;
		if (!contributing.token) return askForCode('');

		contributing.checking = true;
		step = 'choose';
		const info = await checkToken(contributing.token);
		contributing.checking = false;
		if (!contributing.active) return; // cancelled while checking
		contributing.info = info;
		if (info && !info.valid) {
			const reason = info.reason ?? 'This invite code no longer works';
			forgetCode();
			askForCode(`${reason}. Please enter a new code.`);
		}
	}

	async function saveCode(e: SubmitEvent) {
		e.preventDefault();
		const code = codeInput.trim().toUpperCase();
		if (!code) return;
		contributing.checking = true;
		codeError = '';
		const info = await checkToken(code);
		contributing.checking = false;
		if (info && !info.valid) {
			codeError = info.reason ?? 'This invite code does not work';
			return;
		}
		contributing.token = code;
		contributing.info = info;
		storage('session')?.setItem(TOKEN_KEY, code);
		codeInput = '';
		message = '';
		step = afterCode;
	}

	function forgetCode() {
		leave(contributing.token);
		storage('session')?.removeItem(TOKEN_KEY);
		contributing.token = '';
		contributing.info = null;
	}

	/** Reset button: forget the current code and ask for another, keeping any drawing in progress. */
	function resetCode() {
		if (sending) return;
		const next: Step = step === 'form' ? 'form' : 'choose';
		if (step === 'drawing') {
			draw?.clear();
			draw?.setMode('static');
		}
		forgetCode();
		askForCode('', next);
	}

	function cancelCode() {
		// Back to the form if a drawing is waiting, otherwise leave contribute mode
		if (afterCode === 'form' && geometry) step = 'form';
		else stop();
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
		leave(contributing.token);
		contributing.active = false;
		contributing.info = null;
		contributing.checking = false;
		step = 'idle';
	}

	// While editing with a code: check in every 30 s (keeps the live count and edits
	// current) and ask for a new code if this one stops working mid-session.
	// Hidden tabs don't check in, so they drop out of the live count.
	async function heartbeat() {
		const code = contributing.token;
		if (!code || sending || document.hidden) return;
		const info = await checkToken(code);
		if (!info || code !== contributing.token || !contributing.active) return;
		if (!info.valid) {
			forgetCode();
			askForCode(`${info.reason ?? 'This invite code no longer works'}. Please enter a new code.`, step === 'form' ? 'form' : 'choose');
			return;
		}
		contributing.info = info;
	}

	$effect(() => {
		if (!contributing.active || !contributing.token) return;
		const timer = setInterval(heartbeat, HEARTBEAT_MS);
		const onVisible = () => !document.hidden && heartbeat();
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

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
			token: contributing.token,
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
				// update edits / uses left
				heartbeat();
				return;
			}
			if (res.status === 403) {
				// bad or expired invite code: ask for a new one, keep the drawing and form
				forgetCode();
				askForCode(`${out?.message ?? 'This invite code no longer works'}. Enter a new code to send your contribution.`, 'form');
				return;
			}
			message = out?.message ?? 'Could not save, please try again.';
		} catch {
			message = 'No connection. Please try again.';
		} finally {
			sending = false;
		}
	}

	function onPageHide() {
		if (contributing.active) leave(contributing.token);
	}

	onDestroy(() => {
		if (contributing.active) leave(contributing.token);
		contributing.active = false;
		contributing.info = null;
		contributing.reset = null;
		try {
			draw?.stop();
		} catch {
			/* map may already be gone */
		}
	});

	// Blueprint look while editing (see .bp-* in app.css)
	const inputClass = 'bp-input w-full px-2 py-1.5 text-sm';
	const btn = 'px-3 py-1.5 text-sm font-medium';
</script>

<svelte:window onpagehide={onPageHide} />

<!-- Entry button / toolbar, floating over the map -->
<div class="fixed top-3 right-3 z-40 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2">
	{#if step === 'idle'}
		<button class="{btn} rounded bg-pink-600 text-white shadow-sm hover:bg-pink-700" onclick={start}>+ Contribute</button>
	{:else if step === 'choose' || step === 'drawing'}
			{#if contributing.token}
			<div class="blueprint bp-panel w-80 max-w-full">
				<ContributeSession />
			</div>
		{/if}	
	<div class="blueprint bp-panel flex flex-wrap items-center justify-end gap-1 p-1.5">
			<span class="bp-muted px-1 font-mono text-xs uppercase tracking-wider">Map a</span>
			{#each allowedKinds as k (k)}
				<button
					class="{btn} {step === 'drawing' && kind === k ? 'bp-btn' : 'bp-btn-ghost'} disabled:opacity-50"
					disabled={contributing.checking}
					onclick={() => beginDrawing(k)}>{KIND_LABEL[k]}</button
				>
			{/each}
			<button class="{btn} bp-btn-ghost" onclick={stop}>Exit</button>
		</div>
		<p class="blueprint bp-panel px-2 py-1 text-xs">
			{contributing.checking ? 'Checking your invite code…' : step === 'drawing' ? HINTS[kind] : 'Choose what to draw.'}
		</p>

	{/if}
</div>

<!-- Dialogs: centred card on desktop, bottom sheet on phones -->
{#if step === 'code' || step === 'form' || step === 'done'}
	<div class="fixed inset-0 z-[1100] flex items-end justify-center bg-black/30 md:items-center">
		<div
			class="blueprint bp-panel max-h-[85svh] w-full overflow-y-auto p-4 md:max-w-md"
			role="dialog"
			aria-modal="true"
			aria-labelledby="contrib-title"
		>
			{#if step === 'code'}
				<h2 id="contrib-title" class="mb-1 font-mono text-lg font-semibold uppercase tracking-wider">Invite code</h2>
				<p class="bp-muted mb-3 text-sm">
					Contributions need an invite code from the project team. It's in your invite link or QR code.
				</p>
				<form onsubmit={saveCode} class="flex flex-col gap-3">
					<input
						class={inputClass}
						bind:value={codeInput}
						placeholder="e.g. K7Q2BIDAR9XA"
						autocomplete="off"
						aria-invalid={!!codeError}
					/>
					{#if codeError}
						<p class="bp-error px-2 py-1.5 text-sm" role="alert">{codeError}</p>
					{/if}
					<div class="flex justify-end gap-2">
						<button type="button" class="{btn} bp-btn-ghost" onclick={cancelCode}>
							{afterCode === 'form' && geometry ? 'Back' : 'Cancel'}
						</button>
						<button type="submit" class="{btn} bp-btn disabled:opacity-60" disabled={contributing.checking}>
							{contributing.checking ? 'Checking…' : 'Continue'}
						</button>
					</div>
				</form>
			{:else if step === 'form'}
				<h2 id="contrib-title" class="mb-1 font-mono text-lg font-semibold uppercase tracking-wider">Describe this {KIND_LABEL[kind].toLowerCase()}</h2>
				<p class="bp-muted mb-3 text-xs">It will appear on the map after review.</p>
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
						<span class="bp-muted text-xs">Shown as the author on the map once approved.</span>
					</label>
					<!-- honeypot: hidden from people, filled in by bots -->
					<input class="hidden" tabindex="-1" autocomplete="off" aria-hidden="true" bind:value={website} name="website" />

					{#if contributing.token}
						<ContributeSession compact />
					{:else}
						<button type="button" class="{btn} bp-btn-ghost self-start" onclick={() => askForCode('', 'form')}>
							Enter invite code
						</button>
					{/if}

					{#if message}
						<p class="bp-error px-2 py-1.5 text-sm" role="alert">{message}</p>
					{/if}
					<div class="flex flex-wrap justify-end gap-2">
						<button type="button" class="{btn} bp-btn-ghost" onclick={stop} disabled={sending}>Discard</button>
						<button type="button" class="{btn} bp-btn-ghost" onclick={redraw} disabled={sending}>Redraw</button>
						<button type="submit" class="{btn} bp-btn disabled:opacity-60" disabled={sending}>
							{sending ? 'Saving…' : 'Submit'}
						</button>
					</div>
				</form>
			{:else}
				<h2 id="contrib-title" class="mb-1 font-mono text-lg font-semibold uppercase tracking-wider">Thank you!</h2>
				<p class="bp-muted mb-3 text-sm">
					Your contribution is saved and will appear on the map after review.
				</p>
				<div class="flex justify-end gap-2">
					<button class="{btn} bp-btn-ghost" onclick={stop}>Done</button>
					<button class="{btn} bp-btn" onclick={() => (step = 'choose')}>Map another</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
