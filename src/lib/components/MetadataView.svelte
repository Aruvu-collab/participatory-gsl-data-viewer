<!-- Feature properties shown in the map popup (desktop) or bottom sheet (mobile) -->
<script>
	/** @type {any} */
	export let selectedFeature = null;
	// Optional per-layer popup config (e.g. from taxonomy_style):
	// { hide: [keys], labels: { key: 'Label' }, values: { key: { code: 'Label' } }, tags: 'key' }
	/** @type {any} */
	export let popup = null;

	const IMAGE_BASE = 'https://minio.livinglabs.network/pgsl-site/';

	/** @param {any} value */
	const isEmpty = (value) => value === null || value === undefined || value === '';
	/** @param {any} value */
	const isImage = (value) => typeof value === 'string' && value.toLowerCase().includes('dcim/');

	// Blank values are kept so they show as "Not recorded". Fields listed in
	// popup.fields are added if missing (MapLibre drops null properties).
	$: entries = (() => {
		const props = selectedFeature?.properties || {};
		const list = Object.entries(props).filter(([key]) => !key.startsWith('_'));
		for (const key of popup?.fields ?? []) if (!(key in props)) list.push([key, null]);
		return list;
	})();
	$: imageProperties = entries.filter(([, value]) => isImage(value));
	$: nonImageProperties = entries
		.filter(([key, value]) => !isImage(value) && !popup?.hide?.includes(key))
		.sort(popup?.labels ? byPopupOrder : ([a], [b]) => a.localeCompare(b));
	$: extraTags = popup?.tags ? parseTags(selectedFeature?.properties?.[popup.tags]) : [];

	// With a popup config, labelled keys come first in the order they are listed
	/** @param {[string, any]} x @param {[string, any]} y */
	function byPopupOrder([a], [b]) {
		const keys = Object.keys(popup.labels);
		const ia = keys.indexOf(a),
			ib = keys.indexOf(b);
		return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib) || a.localeCompare(b);
	}

	// Contribution "tags" is a JSON object of OSM-style tags. Entries that repeat a
	// column already shown (class, state, local name) are skipped.
	/** @param {any} raw @returns {[string, string][]} */
	function parseTags(raw) {
		let obj = raw;
		if (typeof raw === 'string') {
			try {
				obj = JSON.parse(raw);
			} catch {
				return [];
			}
		}
		if (!obj || typeof obj !== 'object') return [];
		const shown = ['one:class', 'one:state', 'local_name'];
		return Object.entries(obj)
			.filter(([k, v]) => !shown.includes(k) && !isEmpty(v))
			.map(([k, v]) => [k, String(v)]);
	}

	/** @param {string} key */
	function formatKey(key) {
		if (popup?.labels?.[key]) return popup.labels[key];
		return key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
	}
	/** @param {any} value @param {string} [key] */
	function formatValue(value, key) {
		const mapped = key != null ? popup?.values?.[key]?.[value] : undefined;
		if (mapped != null) return mapped;
		if (typeof value === 'boolean') return value ? 'Yes' : 'No';
		if (typeof value === 'number') {
			return value % 1 === 0 ? value.toString() : value.toFixed(4);
		}
		if (typeof value === 'object') return JSON.stringify(value);
		// ISO timestamps (e.g. submitted_at) as a readable date, only for configured popups
		if (popup && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
			const d = new Date(value);
			if (!isNaN(d.getTime()))
				return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
		}
		return value;
	}
	function getName() {
		const p = selectedFeature?.properties ?? {};
		if (popup) {
			return (
				p.local_name ||
				formatValue(p.subtype, 'subtype') ||
				formatValue(p.one_class, 'one_class') ||
				'Contribution'
			);
		}
		const nameEntry = nonImageProperties.find(
			([key, value]) => key.toLowerCase().includes('name') && !isEmpty(value)
		);
		return nameEntry ? String(nameEntry[1]) : 'Unnamed feature';
	}

	// Points get a readable "lat, lon"; lines and polygons are better seen on the map
	$: pointCoords =
		selectedFeature?.geometry?.type === 'Point'
			? `${selectedFeature.geometry.coordinates[1].toFixed(5)}, ${selectedFeature.geometry.coordinates[0].toFixed(5)}`
			: null;

	/** @param {string} filename */
	const imageUrl = (filename) => IMAGE_BASE + filename.replace(/^DCIM\//i, '');

	/** @type {HTMLDialogElement} */
	let lightbox;
	let lightboxSrc = '';
	let lightboxAlt = '';
	/** @param {string} src @param {string} alt */
	function openLightbox(src, alt) {
		lightboxSrc = src;
		lightboxAlt = alt;
		lightbox?.showModal();
	}
	/** @type {Record<string, boolean>} */
	let brokenImages = {};
</script>

<dialog
	bind:this={lightbox}
	class="lightbox"
	aria-label={lightboxAlt || 'Image'}
	on:click={(e) => e.target === lightbox && lightbox.close()}
	on:close={() => (lightboxSrc = '')}
>
	{#if lightboxSrc}
		<img src={lightboxSrc} alt={lightboxAlt} class="max-h-[85vh] max-w-[90vw] object-contain" />
	{/if}
	<button type="button" class="lightbox-close" on:click={() => lightbox.close()} aria-label="Close image">
		<span aria-hidden="true">×</span>
	</button>
</dialog>

{#if selectedFeature?.properties?.url && selectedFeature?.properties?.title}
	{@const p = selectedFeature.properties}
	<article class="flex w-full max-w-sm flex-col gap-2 bg-white">
		{#if p.feature_image}
			<button
				type="button"
				class="focus-ring block rounded-md"
				on:click={() => openLightbox(p.feature_image, p.title)}
				aria-label="Enlarge image: {p.title}"
			>
				<img src={p.feature_image} alt="" class="h-40 w-full rounded-md object-cover" />
			</button>
		{/if}
		<h2 class="text-base leading-snug font-semibold text-gray-900">{p.title}</h2>
		{#if p.published_at}
			<p class="text-xs text-gray-600">
				{new Date(p.published_at).toLocaleDateString(undefined, {
					year: 'numeric',
					month: 'short',
					day: 'numeric'
				})}
			</p>
		{/if}
		{#if p.excerpt}
			<p class="line-clamp-3 text-sm text-gray-700">{p.excerpt}</p>
		{/if}
		<a
			href={p.url}
			target="_blank"
			rel="noopener"
			class="focus-ring rounded text-sm font-medium text-blue-800 underline underline-offset-2 hover:text-blue-950"
			>Read on Untold.Town<span class="sr-only"> (opens in a new tab)</span> →</a
		>
	</article>
{:else if selectedFeature}
	<article class="feature-view flex w-full flex-col gap-3 bg-white text-gray-900">
		<header class="pr-6">
			<h2 class="text-lg leading-snug font-semibold">{getName()}</h2>
			{#if pointCoords}
				<p class="mt-0.5 font-mono text-xs text-gray-600">
					<span class="sr-only">Coordinates: </span>{pointCoords}
				</p>
			{/if}
		</header>

		{#if imageProperties.length > 0}
			<ul class="flex flex-wrap gap-2" aria-label="Photos">
				{#each imageProperties as [key, filename] (key)}
					<li class="relative">
						{#if brokenImages[key]}
							<div
								class="flex h-32 w-32 items-center justify-center rounded-md border border-gray-300 bg-gray-50 p-2 text-center text-sm text-gray-700"
							>
								{formatKey(key)}: image not found
							</div>
						{:else}
							<button
								type="button"
								class="focus-ring block h-32 w-32 overflow-hidden rounded-md border border-gray-300"
								on:click={() => openLightbox(imageUrl(filename), formatKey(key))}
								aria-label="Enlarge photo: {formatKey(key)}"
							>
								<img
									src={imageUrl(filename)}
									alt=""
									loading="lazy"
									class="h-full w-full object-cover"
									on:error={() => (brokenImages = { ...brokenImages, [key]: true })}
								/>
							</button>
							<span
								class="pointer-events-none absolute bottom-1 left-1 rounded bg-white/95 px-1.5 py-0.5 text-xs font-medium text-gray-900"
								aria-hidden="true"
							>
								{formatKey(key)}
							</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		{#if nonImageProperties.length > 0 || extraTags.length > 0}
			<dl class="props">
				{#each nonImageProperties as [key, value] (key)}
					<div class="prop-row">
						<dt>{formatKey(key)}</dt>
						{#if isEmpty(value) || (typeof value === 'string' && value.trim() === '')}
							<dd class="blank">Not recorded</dd>
						{:else}
							<dd>{formatValue(value, key)}</dd>
						{/if}
					</div>
				{/each}
				{#if extraTags.length > 0}
					<div class="prop-row">
						<dt>OSM tags</dt>
						<dd>
							<ul class="flex flex-wrap gap-1">
								{#each extraTags as [k, v] (k)}
									<li class="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-xs">
										{k}={v}
									</li>
								{/each}
							</ul>
						</dd>
					</div>
				{/if}
			</dl>
		{:else}
			<p class="text-sm text-gray-700">No details recorded for this feature.</p>
		{/if}
	</article>
{/if}

<style>
	.feature-view {
		min-width: min(18rem, 80vw);
		max-width: min(32rem, 70vw);
		max-height: min(60vh, 32rem);
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	/* The mobile bottom sheet has its own width and scrolling */
	:global(.bottom-sheet-content) .feature-view {
		max-width: none;
		max-height: none;
		overflow: visible;
	}

	.props {
		margin: 0;
		border: 1px solid #d1d5db;
		border-radius: 0.5rem;
		overflow: hidden;
	}
	.prop-row {
		display: grid;
		grid-template-columns: minmax(6.5rem, 38%) 1fr;
		gap: 0.75rem;
		padding: 0.5rem 0.75rem;
		font-size: 0.875rem;
		line-height: 1.35;
	}
	.prop-row + .prop-row {
		border-top: 1px solid #e5e7eb;
	}
	.prop-row:nth-child(even) {
		background: #f9fafb;
	}
	dt {
		color: #374151; /* gray-700: 10:1 on white, 9.5:1 on the striped rows */
		font-weight: 500;
	}
	dd {
		margin: 0;
		color: #111827;
		overflow-wrap: anywhere;
		white-space: pre-line; /* keep line breaks in notes */
	}
	dd.blank {
		color: #4b5563; /* gray-600: 7.5:1 on white; text, not colour alone, marks it blank */
		font-style: italic;
	}

	.focus-ring:focus-visible,
	.lightbox-close:focus-visible {
		outline: 3px solid #1d4ed8;
		outline-offset: 2px;
	}

	.lightbox {
		padding: 0;
		border: none;
		border-radius: 0.5rem;
		background: #111827;
		max-width: 95vw;
		max-height: 95vh;
	}
	.lightbox::backdrop {
		background: rgb(0 0 0 / 0.8);
	}
	.lightbox-close {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 9999px;
		background: #fff;
		color: #111827;
		font-size: 1.75rem;
		line-height: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	:global(.maplibregl-popup) {
		max-width: 70vw !important;
	}
	/* MapLibre's default close button is a tiny glyph; give it a usable target and focus ring */
	:global(.maplibregl-popup-close-button) {
		width: 2rem;
		height: 2rem;
		font-size: 1.4rem;
		line-height: 1;
		color: #374151;
	}
	:global(.maplibregl-popup-close-button:focus-visible) {
		outline: 3px solid #1d4ed8;
		outline-offset: -3px;
	}
</style>
