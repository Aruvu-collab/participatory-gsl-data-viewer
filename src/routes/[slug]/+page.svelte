<script lang="ts">
	import LeftBar from '$lib/LeftBar.svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { onMount } from 'svelte';

	let { data } = $props();

	let mapContainer: HTMLElement;

	let map: maplibregl.Map;
	onMount(() => {
		map = new maplibregl.Map({
			container: mapContainer,
			style: 'https://api.maptiler.com/maps/streets/style.json?key=XtQybTQjRpKFSRHVSG0G',
			zoom: data.content.zoom,
			center: data.content.center
		});

		map.on('load', () => {
			data.content.layers.forEach((layer: any) => {
				map.addSource(layer.name, {
					type: 'raster',
					// use the tiles option to specify a WMS tile source URL
					// https://maplibre.org/maplibre-style-spec/sources/
					tiles: [layer.url],
					tileSize: 256
				});
				map.addLayer(
					{
						id: layer.name + '_layer',
						type: 'raster',
						source: layer.name,
						paint: {}
					},
					'aeroway_fill'
				);
			});
		});
	});

	// trigger visbility check
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

<div class="grid grid-cols-12">
	<section class="col-span-2">
		<LeftBar />
	</section>
	<section class="col-span-3 h-screen overflow-y-scroll bg-gray-100 p-10">
		<h1 class="font-bold">{data.content.name}</h1>

		{#each data.content.layers as layer}
			<div class="">
				<div class="my-2 grid grid-cols-5">
					<div class="col-span-4">
						<h3>{layer.name}</h3>
						<p class="text-xs">
							Lorem Ipsum is simply dummy text of the printing and typesetting industry.
						</p>
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
	</section>
	<section id="map" class="col-span-7 h-screen" bind:this={mapContainer}></section>
</div>

<style lang="postcss">
	li {
		@apply list-none pt-2;
	}
</style>
