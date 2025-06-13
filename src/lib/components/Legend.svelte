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

{#each data.content.layers as layer}
	<div id="legend">
		<div class="my-2 grid grid-cols-5 bg-neutral-300 p-2 rounded-sm">
			<div class="col-span-4 text-left">
				<h3>{layer.name}</h3>
				<p class="text-xs">
					{layer.description}
				</p>
				{#if layer.export_url}
					{#if layer.export_url.csv}
						<a href="{layer.export_url.csv}" target="_blank">Download CSV</a>
					{/if}
					{#if layer.export_url.geojson}
						| <a href="{layer.export_url.geojson}" target="_blank">Download GeoJSON</a>
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

<style lang="postcss">
a {
	@apply text-xs text-blue-800;
}
</style>