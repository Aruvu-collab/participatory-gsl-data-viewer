<script>
	//https://github.com/geoman-io/maplibre-geoman
	// https://github.com/jdsantos/maplibre-gl-measures
	import LeftBar from '$lib/components/LeftBar.svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { onMount, mount } from 'svelte';
	import Legend from '$lib/components/Legend.svelte';

	import * as Drawer from '$lib/components/ui/drawer';
	import { Button } from '$lib/components/ui/button';
	import MetadataView from '$lib/components/MetadataView.svelte';
	import { Dialog } from 'bits-ui';

	let { data } = $props();
	let screenWidth = $state(0);
	let selectedFeature = $state(null);
	let mapContainer;
	let map;

	const isMobile = $derived(screenWidth <= 768);

	onMount(async () => {
		map = new maplibregl.Map({
			container: mapContainer,
			style:
				'https://api.maptiler.com/maps/01988288-c280-7831-afe4-bc23d4dcb573/style.json?key=XtQybTQjRpKFSRHVSG0G',
			zoom: data.content.zoom,
			center: data.content.center,
			maxZoom: 17,
			minZoom: 7,
			pitch: 0,
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
				pitch: 10,
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
							'circle-radius': 5,
							'circle-stroke-width': 2, // Stroke width in pixels
							'circle-stroke-color': '#ffffff'
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
								'text-offset': [2, -2]
							},
							paint: {
								'text-color': '#000',
								'text-halo-color': '#ffffff', // Background color
								'text-halo-width': 2, // Background width in pixels
								'text-halo-blur': 1 // Optional blur effect
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

						// Create a container div for the Svelte component
						const popupContainer = document.createElement('div');
						popupContainer.classList.add('popup');

						// Mount the Svelte component to the container
						const popupContent = mount(MetadataView, {
							target: popupContainer,
							props: { selectedFeature: selectedFeature }
						});

						if (isMobile) {
							// Mobile: Bottom sheet
							const sheet =
								document.querySelector('.bottom-sheet') ||
								(() => {
									const s = document.createElement('div');
									s.className = 'bottom-sheet';
									s.innerHTML = `
                                                    <div class="bottom-sheet-handle"></div>
                                                    <button class="bottom-sheet-close">×</button>
                                                    <div class="bottom-sheet-content"></div>
                                                  `;
									document.body.appendChild(s);
									s.querySelector('.bottom-sheet-close').onclick = () => s.classList.remove('open');
									return s;
								})();

							sheet.querySelector('.bottom-sheet-content').innerHTML = '';
							sheet.querySelector('.bottom-sheet-content').appendChild(popupContainer);
							requestAnimationFrame(() => sheet.classList.add('open'));
						} else {
							const coordinates = e.features[0].geometry.coordinates.slice();

							// Ensure that if the map is zoomed out such that multiple
							// copies of the feature are visible, the popup appears
							// over the copy being pointed to.
							while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
								coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
							}

							// Use setDOMContent() instead of setHTML() for DOM elements
							new maplibregl.Popup()
								.setLngLat(coordinates)
								.setDOMContent(popupContainer) // Changed from setHTML
								.addTo(map);
						}
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
		<section class="col-span-3 md:max-h-screen">
			<div class="col-span-2">
				<Legend bind:data bind:map />
			</div>
		</section>
	{:else}
		<section class="absolute right-0 bottom-0 z-50 m-1 grid max-h-[60vh] w-full gap-2">
			{#if selectedFeature}
				<!-- <Drawer.Root>
					<Drawer.Trigger class="w-full rounded-sm bg-gray-100 p-2"
						>View properties ↑</Drawer.Trigger
					>
					<Drawer.Content class="bg-gray-200">
						<Drawer.Header></Drawer.Header>
						<MetadataView {selectedFeature}></MetadataView>
					</Drawer.Content>
				</Drawer.Root> -->
			{/if}

			<Drawer.Root>
				<Drawer.Trigger class="w-full rounded-sm bg-gray-100 p-2">Legend ↑</Drawer.Trigger>
				<Drawer.Content class="bg-gray-200">
					<Legend bind:data bind:map />
				</Drawer.Content>
			</Drawer.Root>
		</section>
	{/if}

	<section id="map" class="col-span-12 h-screen md:col-span-9" bind:this={mapContainer}></section>
</div>

<style lang="postcss">
	@reference "tailwindcss";
	li {
		@apply list-none pt-2;
	}

	:global {
		/* Bottom Sheet Styles */
		.bottom-sheet {
			position: fixed;
			bottom: 0;
			left: 0;
			right: 0;
			background: white;
			border-radius: 20px 20px 0 0;
			box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
			transform: translateY(100%);
			transition: transform 0.3s ease-out;
			z-index: 1000;
			max-height: 80vh;
			display: none;
		}

		/* Show bottom sheet on mobile */
		@media (max-width: 768px) {
			.bottom-sheet {
				display: block;
			}

			/* Hide default maplibre popup on mobile */
			.maplibregl-popup {
				display: none;
			}
		}

		/* Open state */
		.bottom-sheet.open {
			transform: translateY(0);
		}

		/* Drag handle */
		.bottom-sheet-handle {
			width: 40px;
			height: 4px;
			background: #ccc;
			border-radius: 2px;
			margin: 12px auto;
			cursor: grab;
			touch-action: none;
		}

		.bottom-sheet-handle:active {
			cursor: grabbing;
		}

		/* Content area */
		.bottom-sheet-content {
			padding: 0 20px 20px;
			overflow-y: auto;
			max-height: calc(80vh - 40px);
		}

		/* Close button */
		.bottom-sheet-close {
			position: absolute;
			top: 16px;
			right: 16px;
			background: transparent;
			border: none;
			font-size: 28px;
			color: #666;
			cursor: pointer;
			width: 32px;
			height: 32px;
			display: flex;
			align-items: center;
			justify-content: center;
			line-height: 1;
			padding: 0;
		}

		.bottom-sheet-close:hover {
			color: #333;
		}

		/* Backdrop/overlay (optional) */
		.bottom-sheet-backdrop {
			position: fixed;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			background: rgba(0, 0, 0, 0.5);
			opacity: 0;
			transition: opacity 0.3s ease-out;
			z-index: 999;
			pointer-events: none;
			display: none;
		}

		@media (max-width: 768px) {
			.bottom-sheet-backdrop {
				display: block;
			}

			.bottom-sheet-backdrop.open {
				opacity: 1;
				pointer-events: auto;
			}
		}

		/* Desktop popup styling */
		@media (min-width: 769px) {
			.maplibregl-popup.popup {
				/* Your existing popup styles */
			}
		}

		/* Smooth scrolling for content */
		.bottom-sheet-content {
			-webkit-overflow-scrolling: touch;
		}

		/* Alternative: Full height draggable bottom sheet */
		.bottom-sheet.expanded {
			max-height: 70vh;
		}

		/* Collapsed state (peek view) */
		.bottom-sheet.peek {
			transform: translateY(calc(100% - 120px));
		}

		.bottom-sheet.peek .bottom-sheet-content {
			overflow: hidden;
		}
	}
</style>
