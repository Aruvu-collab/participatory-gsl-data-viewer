<script>
	import LeftBar from '$lib/components/LeftBar.svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { onMount } from 'svelte';
	import Legend from '$lib/components/Legend.svelte';

	import * as Drawer from '$lib/components/ui/drawer';
	import { Button } from '$lib/components/ui/button';
	import MetadataView from '$lib/components/MetadataView.svelte';

	let { data } = $props();
	let screenWidth = $state(0);
	let selectedFeature = $state(null);
	let mapContainer;
	let map;

	onMount(() => {
		map = new maplibregl.Map({
			container: mapContainer,
			style:
				'https://api.maptiler.com/maps/01988288-c280-7831-afe4-bc23d4dcb573/style.json?key=XtQybTQjRpKFSRHVSG0G',
			zoom: data.content.zoom,
			center: data.content.center,
			maxZoom: 19,
			minZoom: 7,
			pitch: 30,
			canvasContextAttributes: {
				antialias: false, // Disable antialiasing for better performance
				contextType: 'webgl2' // Choose which WebGL version to use
			},
			maxTileCacheSize: 300, // Limit cache size (null = dynamic sizing)
			maxTileCacheZoomLevels: 5, // Limit how many zoom levels to cache
			// Animation optimization
			fadeDuration: 200, // shorter fade

			// Feature reduction
			renderWorldCopies: false // if not needed
		});

		map.on('click', (e) => {
			map.flyTo({
				center: e.lngLat,
				pitch: 80,
				zoom: 18,
				essential: true,
				speed: 0.3
			});
		});
		map.on('load', () => {
			// Add geolocation control
			map.addControl(
				new maplibregl.GeolocateControl({
					positionOptions: {
						enableHighAccuracy: true
					},
					trackUserLocation: true
				})
			);
			map.addControl(
				new maplibregl.NavigationControl({
					visualizePitch: true,
					showZoom: true,
					showCompass: true
				})
			);

			// Add all configured layers
			data.content.layers.forEach((layer) => {
				// Handle GeoJSON layers
				if (layer.type === 'geojson') {
					map.addSource(layer.name, {
						type: 'geojson',
						data: layer.url
					});

					// Add fill layer
					map.addLayer({
						id: layer.name + '_layer_fill',
						type: 'fill',
						source: layer.name,
						paint: {
							'fill-color': layer.color
						}
					});

					// Add line layer
					map.addLayer({
						id: layer.name + '_layer_line',
						type: 'line',
						source: layer.name,
						paint: {
							'line-color': layer.color
						}
					});

					// Add point layer
					map.addLayer({
						id: layer.name + '_layer_point',
						type: 'circle',
						source: layer.name,
						paint: {
							'circle-color': layer.color,
							'circle-radius': 5
						}
					});

					// Add labels if configured
					if (layer.label) {
						map.addLayer({
							id: layer.name + '_layer_label',
							type: 'symbol',
							source: layer.name,
							layout: {
								'text-field': ['get', layer.label],
								'text-font': ['Open Sans Regular'],
								'text-allow-overlap': false,
								'text-ignore-placement': false,
								'text-size': 12,
								'text-offset': [0, 1]
							},
							paint: {
								'text-color': '#000'
							}
						});
					}

					const layerId = layer.name + '_layer_point';
					map.on('mouseenter', layerId, () => {
						map.getCanvas().style.cursor = 'help';
					});

					// Change it back to a pointer when it leaves.
					map.on('mouseleave', layerId, () => {
						map.getCanvas().style.cursor = 'pointer';
					});
					map.on('click', layerId, (e) => {
						if (e.features.length === 0) return;
						selectedFeature = e.features[0];

						map.flyTo({
							center: e.features[0].geometry.coordinates,
							zoom: 15,
							pitch: 30,
							essential: true
						});
					});
				}
				// Handle DEM
				else if (layer.type == 'raster-dem') {
					map.addSource(layer.name, {
						type: 'raster-dem',
						tiles: [layer.url],
						tileSize: 256
					});

					map.setTerrain({
						source: layer.name,
						exaggeration: 0.00005
					});

					map.addControl(
						new maplibregl.TerrainControl({
							source: 'terrainSource',
							exaggeration: 1
						})
					);
				}
				// Handle raster layers
				else if (layer.type === 'raster') {
					map.addSource(layer.name, {
						type: 'raster',
						tiles: [layer.url],
						tileSize: 256
					});

					map.addLayer({
						id: layer.name + '_layer',
						type: 'raster',
						source: layer.name,
						paint: {
							'raster-opacity': layer.opacity
						}
					});
				}
				// Handle vector layers
				else if (layer.type === 'vector') {
					map.addSource(layer.name, {
						type: 'vector',
						tiles: [layer.url],
						scheme: 'tms'
					});

					if (layer.layer_names && Array.isArray(layer.layer_names)) {
						layer.layer_names.forEach((source_layer) => {
							map.addLayer({
								id: layer.name + '_layer_' + source_layer,
								type: 'line',
								source: layer.name,
								'source-layer': source_layer,
								paint: {
									'line-color': layer.color,
									'line-width': 2
								}
							});
						});
					}

					if (layer.label) {
						map.addLayer({
							id: layer.name + '_layer_label',
							type: 'symbol',
							source: layer.name,
							layout: {
								'text-field': ['get', layer.label],
								'text-font': ['Open Sans Regular'],
								'text-allow-overlap': false,
								'text-ignore-placement': false,
								'text-size': 12,
								'text-offset': [0, 1]
							},
							paint: {
								'text-color': '#000'
							}
						});
					}
				}

				map.setLayoutProperty(
					layer.name + '_layer',
					'visibility',
					layer.visible ? 'visible' : 'none'
				);
			});
		});
	});
</script>

<svelte:window bind:innerWidth={screenWidth} />

<div class="grid w-screen grid-cols-12">
	<!-- <section class="col-span-12 md:col-span-2">
			<LeftBar />
		
	</section> -->
	{#if screenWidth > 768}
		<section class="col-span-5 grid grid-cols-5 gap-x-5 md:max-h-screen">
			<div class="col-span-2">
				<Legend bind:data bind:map />
			</div>
			<div class="col-span-3">
				<MetadataView {selectedFeature}></MetadataView>
			</div>
		</section>
	{:else}
		<section class="absolute right-0 bottom-0 z-50 m-1 grid max-h-[60vh] w-full gap-2">
			{#if selectedFeature}
				<Drawer.Root>
					<Drawer.Trigger class="w-full rounded-sm bg-gray-100 p-2"
						>View properties ↑</Drawer.Trigger
					>
					<Drawer.Content class="bg-gray-200">
						<Drawer.Header></Drawer.Header>
						<MetadataView {selectedFeature}></MetadataView>
					</Drawer.Content>
				</Drawer.Root>
			{/if}

			<Drawer.Root>
				<Drawer.Trigger class="w-full rounded-sm bg-gray-100 p-2">Legend ↑</Drawer.Trigger>
				<Drawer.Content class="bg-gray-200">
					<Legend bind:data bind:map />
				</Drawer.Content>
			</Drawer.Root>
		</section>
	{/if}

	<section id="map" class="col-span-12 h-screen md:col-span-7" bind:this={mapContainer}></section>
</div>

<style lang="postcss">
	@reference "tailwindcss";
	li {
		@apply list-none pt-2;
	}
</style>
