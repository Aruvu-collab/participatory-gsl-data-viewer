<script lang="ts">
	export let map;
	export let data;
	function handleVisibilityChange(layer: any) {
		if (map) {
			map.setLayoutProperty(
				layer.name + '_layer',
				'visibility',
				layer.visible ? 'visible' : 'none'
			);
		}
	}
</script>

<section id="legend" class="md:max-h-screen grid gap-3 grid-rows-12 gap-10 p-4">
	<div class="row-span-3">
	<a class="font-size-[0.2em]" href="/">From the Participatory Geospatial Lab.</a>
	<h1 class="font-bold">{data.content.name}</h1>
	<p class="my-2 text-xs">{data.content.short_desc}</p>
</div>
	<div class="row-span-8 overflow-y-scroll ">
	{#each data.content.layers as layer}
		<div id="legend-item h-auto">
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
							handleVisibilityChange(layer);
						}}
						aria-checked={layer.visible}
					/>
				</div>
			</div>
		</div>
	{/each}
</div>
</section>

<style lang="postcss">
	@reference 'tailwindcss';
	a {
		@apply text-xs text-blue-800;
	}
</style>
