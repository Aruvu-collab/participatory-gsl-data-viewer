<script lang="ts">
	import LeftBar from '$lib/components/LeftBar.svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { onMount } from 'svelte';
	import Legend from '$lib/components/Legend.svelte';

	import * as Drawer from '$lib/components/ui/drawer';
	import { Button } from '$lib/components/ui/button';

	let { data } = $props();

	let screenWidth: number = $state(0);

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
</script>

<svelte:window bind:innerWidth={screenWidth} />

<div class="grid w-screen grid-cols-12">
	<section class="col-span-12 md:col-span-2">
		<LeftBar />
	</section>
	{#if screenWidth > 768}
		<section class="col-span-3 h-screen overflow-y-scroll bg-gray-100 p-10">
			<h1 class="font-bold">{data.content.name}</h1>
			<Legend bind:data bind:map />
		</section>
	{:else}
		<section class="absolute bottom-0 right-0 z-50 m-1 w-full">
			<Drawer.Root>
				<Drawer.Trigger class="w-full rounded-sm bg-gray-100 p-2">Legend ↑</Drawer.Trigger>
				<Drawer.Content>
					<Drawer.Header>
						<Drawer.Title>{data.content.name}</Drawer.Title>
						<Drawer.Description><Legend bind:data bind:map /></Drawer.Description>
					</Drawer.Header>
					<!-- <Drawer.Footer>
						<Button>Submit</Button>
						<Drawer.Close>Cancel</Drawer.Close>
					</Drawer.Footer> -->
				</Drawer.Content>
			</Drawer.Root>
		</section>
	{/if}

	<section id="map" class="col-span-12 h-screen md:col-span-7" bind:this={mapContainer}></section>
</div>

<style lang="postcss">
	li {
		@apply list-none pt-2;
	}
</style>
