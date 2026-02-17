<script lang="ts">
	export let map;
	export let data;

	function toggleNlayersVisibility(layer) {
		if (map) {
			const allLayers = map.getStyle().layers;
			const nlayers = allLayers.filter((l) =>
				l.id.toLowerCase().includes(layer.name.toLowerCase())
			);

			nlayers.forEach((layer) => {
				console.log(map.getLayoutProperty(layer.id, 'visibility'));
				map.setLayoutProperty(
					layer.id,
					'visibility',
					map.getLayoutProperty(layer.id, 'visibility') == 'none' ? 'visible' : 'none'
				);
			});
		}
	}
</script>

<section id="legend" class="flex flex-col gap-10 p-4 md:max-h-screen">
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
	<div class="overflow-y-scroll">
		{#each data.content.layers as layer}
			<div id="legend-item ">
				<div class="my-2 grid grid-cols-5 rounded-sm bg-neutral-300 p-2">
					<div class="col-span-4 text-left">
						<h3>{layer.name}</h3>
						<p class="text-xs">
							{layer.description}
						</p>
						{#if layer.export_url}
							{#if layer.export_url.csv}
								<a href={layer.export_url.csv} target="_blank">Download CSV</a>
							{/if}
							{#if layer.export_url.geojson}
								| <a href={layer.export_url.geojson} target="_blank">Download GeoJSON</a>
							{/if}
						{/if}
						<span></span>
					</div>
					<div class="my-auto px-5 align-middle">
						<input
							type="checkbox"
							id={layer.name}
							bind:checked={layer.visible}
							onchange={() => {
								toggleNlayersVisibility(layer);
							}}
							aria-checked={layer.visible}
						/>
					</div>
				</div>
			</div>
		{/each}
	</div>
	<footer>
		<div class="text-xs">
			All data unless otherwise mentioned is licensed under CC BY-NC-SA. This license enables
			reusers to distribute, remix, adapt, and build upon the material in any medium or format for
			noncommercial purposes only, and only so long as attribution is given to the creator. If you
			remix, adapt, or build upon the material, you must license the modified material under
			identical terms. CC BY-NC-SA includes the following elements:
			<br />
			<div class="my-2 grid grid-cols-8 gap-3">
				<div class="col-span-2">
					<img src="/by-nc-sa.png" />
				</div>

				<div class="!list-none col-span-6">
					<li>BY: credit must be given to the creator.</li>
					<li>NC: Only noncommercial uses of the work are permitted.</li>
					<li>SA: Adaptations must be shared under the same terms.</li>
				</div>
			</div>
		</div>
	</footer>
</section>

<style lang="postcss">
	@reference 'tailwindcss';
	a {
		@apply text-xs text-blue-800;
	}
</style>
