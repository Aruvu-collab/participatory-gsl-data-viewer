<script lang="ts">
	export let map;
	export let data;

	const CATEGORY_ORDER = ['data', 'reference', 'basemap'];
	const CATEGORY_LABELS: Record<string, string> = {
		data: 'Map Data',
		reference: 'Reference Layers',
		basemap: 'Basemap'
	};

	// One legend row per layer, except layers sharing a legend_group, which
	// collapse into a single row that toggles all its members together.
	function toRows(layers: any[]) {
		const rows: any[] = [];
		const groups = new Map();
		for (const l of layers) {
			if (!l.legend_group) {
				rows.push({ ...l, members: [l] });
				continue;
			}
			let row = groups.get(l.legend_group);
			if (!row) {
				row = { ...l, name: l.legend_group, members: [] };
				groups.set(l.legend_group, row);
				rows.push(row);
			}
			row.members.push(l);
			row.visible = row.members.some((m: any) => m.visible);
		}
		return rows;
	}

	$: categories = CATEGORY_ORDER
		.map((id) => ({
			id,
			// a group is placed in the category of its first member
			layers: toRows(data.content.layers).filter((r) => (r.category ?? 'data') === id)
		}))
		.filter((g) => g.layers.length > 0);

	function setRowVisibility(row: any, visible: boolean) {
		if (!map) return;
		const allLayers = map.getStyle().layers;
		for (const member of row.members) {
			member.visible = visible;
			const prefix = member.name + '_layer';
			allLayers
				.filter((l: any) => l.id === prefix || l.id.startsWith(prefix + '_'))
				.forEach((l: any) => map.setLayoutProperty(l.id, 'visibility', visible ? 'visible' : 'none'));
		}
		data = data; // recompute rows (keeps desktop and drawer legends in sync)
	}
</script>

<section id="legend" class="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 md:max-h-screen">
	<div class="">
		<a class="text-xs/6" href="/"
			>Home | From the <span class="bg-pink-600 px-2 text-white">
				Participatory Geospatial Lab.</span
			></a
		>
		<h1 class="my-2 text-3xl font-bold">
			<span class="bg-pink-800 text-white">{data.content.name}</span>
		</h1>
		<p class="my-2 text-xs">{data.content.short_desc}</p>
	</div>
	<div class="min-h-0 flex-1 overflow-y-auto">
		{#each categories as group}
			<p class="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
				{CATEGORY_LABELS[group.id] ?? group.id}
			</p>
			{#each group.layers as layer}
				{@const isBasemap = group.id === 'basemap'}
				<div class="my-1 flex items-center gap-2 rounded-sm p-1.5
					{isBasemap ? 'bg-neutral-200 opacity-70' : 'bg-neutral-300'}">
					{#if layer.icon}
						<img src={layer.icon} width={isBasemap ? 12 : 16} height={isBasemap ? 12 : 16} class="shrink-0" alt="" />
					{/if}
					<div class="min-w-0 flex-1">
						<span class="{isBasemap ? 'text-xs text-neutral-500' : 'text-sm font-medium'}">{layer.name}</span>
						{#if !isBasemap && layer.description}
							<p class="truncate text-xs text-neutral-600">{layer.description}</p>
						{/if}
						{#if layer.export_url}
							<div class="text-xs">
								{#if layer.export_url.csv}<a href={layer.export_url.csv} target="_blank">CSV</a>{/if}
								{#if layer.export_url.geojson}<a href={layer.export_url.geojson} target="_blank">GeoJSON</a>{/if}
							</div>
						{/if}
					</div>
					<input
						type="checkbox"
						id={layer.name}
						checked={layer.visible}
						onchange={(e) => setRowVisibility(layer, e.currentTarget.checked)}
						aria-checked={layer.visible}
						class="shrink-0"
					/>
				</div>
			{/each}
		{/each}
		<footer class="mt-4 border-t border-neutral-300 pt-3">
			<div class="text-xs">
				All data unless otherwise mentioned is licensed under CC BY-NC-SA. This license enables
				reusers to distribute, remix, adapt, and build upon the material in any medium or format for
				noncommercial purposes only, and only so long as attribution is given to the creator. If you
				remix, adapt, or build upon the material, you must license the modified material under
				identical terms. CC BY-NC-SA includes the following elements:
				<br />
				<div class="my-2 grid grid-cols-8 gap-3">
					<div class="col-span-2">
						<img src="/by-nc-sa.png" alt="CC BY-NC-SA" />
					</div>

					<div class="!list-none col-span-6">
						<li>BY: credit must be given to the creator.</li>
						<li>NC: Only noncommercial uses of the work are permitted.</li>
						<li>SA: Adaptations must be shared under the same terms.</li>
					</div>
				</div>
			</div>
		</footer>
	</div>
</section>

<style lang="postcss">
	@reference 'tailwindcss';
	a {
		@apply text-xs text-blue-800;
	}
</style>
