<script>
	//https://github.com/geoman-io/maplibre-geoman
	// https://github.com/jdsantos/maplibre-gl-measures
	import LeftBar from '$lib/components/LeftBar.svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { onMount, mount } from 'svelte';
	import Legend from '$lib/components/Legend.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	import * as Drawer from '$lib/components/ui/drawer';
	import { Button } from '$lib/components/ui/button';
	import MetadataView from '$lib/components/MetadataView.svelte';
	import { loaders, addThumbnailImages, enableStoryCards } from '$lib/loaders/ghost';
	import { Dialog } from 'bits-ui';

	let { data } = $props();
	let screenWidth = $state(0);
	let selectedFeature = $state(null);
	let mapContainer;
	let map;

	const isMobile = $derived(screenWidth <= 768);

	// MapLibre GeoJSON must be WGS84 lon/lat. GeoServer WFS returns the layer's
	// native CRS (often EPSG:3857) unless srsName is given, so force it.
	function ensureWgs84(url, name) {
		if (/[?&]service=wfs/i.test(url) && !/[?&]srsName=/i.test(url)) {
			console.warn(`Layer "${name}": WFS url has no srsName, requesting EPSG:4326`);
			return url + (url.includes('?') ? '&' : '?') + 'srsName=EPSG:4326';
		}
		return url;
	}

	// [west, south, east, north] for any GeoJSON geometry
	function geometryBbox(geom) {
		let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
		const walk = (c) => {
			if (typeof c[0] === 'number') {
				w = Math.min(w, c[0]); e = Math.max(e, c[0]);
				s = Math.min(s, c[1]); n = Math.max(n, c[1]);
			} else c.forEach(walk);
		};
		if (geom.type === 'GeometryCollection') geom.geometries.forEach((g) => walk(g.coordinates));
		else walk(geom.coordinates);
		return isFinite(w) ? [w, s, e, n] : null;
	}

	// Points anchor at the feature; lines/polygons at the click location
	function popupAnchor(feature, lngLat) {
		if (feature.geometry.type !== 'Point') return lngLat;
		const c = feature.geometry.coordinates.slice();
		while (Math.abs(lngLat.lng - c[0]) > 180) c[0] += lngLat.lng > c[0] ? 360 : -360;
		return c;
	}

	// Function to update URL with current layer visibility
	function updateLayersInUrl() {
		if (!map) return;
		
		const visibleLayers = data.content.layers
			.filter(layer => {
				const prefix = layer.name + '_layer';
				return map.getStyle().layers.some(
					(l) =>
						(l.id === prefix || l.id.startsWith(prefix + '_')) &&
						map.getLayoutProperty(l.id, 'visibility') !== 'none'
				);
			})
			.map(layer => layer.name)
			.join(',');
		
		const url = new URL(window.location.href);
		if (visibleLayers) {
			url.searchParams.set('layers', visibleLayers);
		} else {
			url.searchParams.delete('layers');
		}
		goto(url.pathname + url.search, { replaceState: true, noScroll: true });
	}

	onMount(async () => {
		// Get URL params
		const urlParams = new URLSearchParams(window.location.search);
		const urlLng = urlParams.get('lng');
		const urlLat = urlParams.get('lat');
		const urlZoom = urlParams.get('zoom');
		const urlPitch = urlParams.get('pitch');
		const urlBearing = urlParams.get('bearing');
		const urlLayers = urlParams.get('layers');

		map = new maplibregl.Map({
			container: mapContainer,
			style:
				'https://api.maptiler.com/maps/01988288-c280-7831-afe4-bc23d4dcb573/style.json?key=XtQybTQjRpKFSRHVSG0G',
			zoom: urlZoom ? parseFloat(urlZoom) : data.content.zoom,
			center: urlLng && urlLat ? [parseFloat(urlLng), parseFloat(urlLat)] : data.content.center,
			pitch: urlPitch ? parseFloat(urlPitch) : 0,
			bearing: urlBearing ? parseFloat(urlBearing) : 0,
			maxZoom: 17,
			minZoom: 7,
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

		// Update URL when map moves
		let moveTimeout;
		map.on('moveend', () => {
			clearTimeout(moveTimeout);
			moveTimeout = setTimeout(() => {
				const center = map.getCenter();
				const zoom = map.getZoom();
				const pitch = map.getPitch();
				const bearing = map.getBearing();
				
				const url = new URL(window.location.href);
				url.searchParams.set('lng', center.lng.toFixed(6));
				url.searchParams.set('lat', center.lat.toFixed(6));
				url.searchParams.set('zoom', zoom.toFixed(2));
				url.searchParams.set('pitch', pitch.toFixed(0));
				url.searchParams.set('bearing', bearing.toFixed(0));
				goto(url.pathname + url.search, { replaceState: true, noScroll: true });
			}, 500);
		});

		map.on('load', async () => {
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

			// Pre-load SVG icons before adding layers
			await Promise.all(
				data.content.layers
					.filter((l) => l.type === 'geojson' && l.icon)
					.map(
						(layer) =>
							new Promise((resolve) => {
								const img = new Image(24, 24);
								img.src = layer.icon;
								img.onload = () => { map.addImage(layer.name + '_icon', img); resolve(null); };
								img.onerror = () => resolve(null);
							})
					)
			);

			// Add all configured layers, sorted by render order
			// Register every GeoJSON source up front, so layers that share a source
			// work regardless of render order.
			// Loader layers (e.g. "loader": "ghost") build their GeoJSON in the browser; run in parallel
			const loaded = new Map();
			await Promise.all(
				data.content.layers
					.filter((l) => l.type === 'geojson' && l.loader)
					.map(async (layer) => {
						const load = loaders[layer.loader];
						if (!load) return console.warn(`Layer "${layer.name}": unknown loader "${layer.loader}"`);
						let fc = await load(layer[layer.loader] ?? {});
						if (layer.thumbnails) fc = await addThumbnailImages(map, layer.name, fc, layer.thumbnails);
						loaded.set(layer.name, fc);
					})
			);

			for (const layer of data.content.layers) {
				if (layer.type !== 'geojson' || (!layer.url && !loaded.has(layer.name))) continue;
				const sourceId = layer.source ?? layer.name;
				if (!map.getSource(sourceId)) {
					map.addSource(sourceId, {
						type: 'geojson',
						data: loaded.get(layer.name) ?? ensureWgs84(layer.url, layer.name)
					});
				}
			}

			// Layers without an explicit order go on top (above basemaps/reference rasters)
			const sortedLayers = [...data.content.layers].sort(
				(a, b) => (a.order ?? Infinity) - (b.order ?? Infinity)
			);
			sortedLayers.forEach((layer) => {
			  try {
				// Handle GeoJSON layers
				if (layer.type === 'geojson') {
					const sourceId = layer.source ?? layer.name;
					if (!map.getSource(sourceId)) {
						console.warn(`Layer "${layer.name}" skipped: source "${sourceId}" has no url`);
						return;
					}

					const interactiveIds = [];
					const filterExpr = layer.filter ?? undefined;
					const color = layer.color ?? '#000000';
					// Also picks the default label placement when layers_spec is used
					const geomType = layer.geometry_type;

					if (layer.layers_spec) {
						// Override for the geometry: MapLibre layer objects from the config,
						// added in order. id and source are filled in here; a layer-level
						// `filter` applies to every entry that doesn't set its own.
						// `label` below is still added alongside.
						layer.layers_spec.forEach((spec, i) => {
							const id = `${layer.name}_layer_${i}`;
							const filter = spec.filter ?? filterExpr;
							map.addLayer({ ...spec, id, source: sourceId, ...(filter && { filter }) });
							// Text-only symbol layers (labels) are not clickable
							if (spec.type !== 'symbol' || spec.layout?.['icon-image']) interactiveIds.push(id);
						});
					} else {
					// Default: build layers from geometry_type / color / style
					if (geomType === 'polygon') {
						map.addLayer({
							id: layer.name + '_layer_fill',
							type: 'fill',
							source: sourceId,
							...(filterExpr && { filter: filterExpr }),
							paint: layer.style?.fill ?? { 'fill-color': color, 'fill-opacity': 0.4 }
						});
						map.addLayer({
							id: layer.name + '_layer_line',
							type: 'line',
							source: sourceId,
							...(filterExpr && { filter: filterExpr }),
							paint: layer.style?.line ?? { 'line-color': color, 'line-width': 2 }
						});
					} else if (geomType === 'line') {
						// Multi-layer lines (e.g. casing) belong in layers_spec
						map.addLayer({
							id: layer.name + '_layer_line',
							type: 'line',
							source: sourceId,
							...(filterExpr && { filter: filterExpr }),
							paint: layer.style?.line ?? { 'line-color': color, 'line-width': 2 }
						});
					} else if (layer.thumbnails) {
						// Fallback circles for features without a loaded thumbnail
						map.addLayer({
							id: layer.name + '_layer_point',
							type: 'circle',
							source: sourceId,
							filter: filterExpr
								? ['all', ['!', ['has', 'thumb']], filterExpr]
								: ['!', ['has', 'thumb']],
							paint: layer.style?.circle ?? {
								'circle-color': color,
								'circle-radius': 6,
								'circle-stroke-width': 2,
								'circle-stroke-color': '#ffffff'
							}
						});
						map.addLayer({
							id: layer.name + '_layer_thumb',
							type: 'symbol',
							source: sourceId,
							filter: filterExpr ? ['all', ['has', 'thumb'], filterExpr] : ['has', 'thumb'],
							layout: {
								'icon-image': ['get', 'thumb'],
								'icon-allow-overlap': true
							}
						});
					} else if (layer.icon) {
						map.addLayer({
							id: layer.name + '_layer_point',
							type: 'symbol',
							source: sourceId,
							...(filterExpr && { filter: filterExpr }),
							layout: {
								'icon-image': layer.name + '_icon',
								'icon-size': 1,
								'icon-allow-overlap': true
							}
						});
					} else {
						map.addLayer({
							id: layer.name + '_layer_point',
							type: 'circle',
							source: sourceId,
							...(filterExpr && { filter: filterExpr }),
							paint: layer.style?.circle ?? {
								'circle-color': color,
								'circle-radius': 5,
								'circle-stroke-width': 2,
								'circle-stroke-color': '#ffffff'
							}
						});
					}

					['_layer_fill', '_layer_line', '_layer_point', '_layer_thumb']
						.map((s) => layer.name + s)
						.filter((id) => map.getLayer(id))
						.forEach((id) => interactiveIds.push(id));
					}

					// Labels: added for both the default and layers_spec paths
					if (layer.label) {
						map.addLayer({
							id: layer.name + '_layer_label',
							type: 'symbol',
							source: sourceId,
							...(filterExpr && { filter: filterExpr }),
							layout: {
								'text-field': ['get', layer.label],
								'text-font': ['Open Sans Regular'],
								'text-allow-overlap': false,
								'text-ignore-placement': false,
								...(layer.style?.symbol_layout ??
									(geomType === 'polygon'
										? { 'text-size': 12 }
										: geomType === 'line'
											? { 'text-size': 12, 'symbol-placement': 'line' }
											: layer.thumbnails
												? {
														'text-size': 12,
														'text-anchor': 'top',
														'text-offset': [0, ((layer.thumbnails.size ?? 48) / 2 + 4) / 12]
													}
												: { 'text-size': 12, 'text-offset': [2, -2] }))
							},
							paint: layer.style?.symbol ?? {
								'text-color': '#000',
								'text-halo-color': '#ffffff',
								'text-halo-width': 2,
								'text-halo-blur': 1
							}
						});
					}

					interactiveIds.forEach((layerId) => {
					map.on('mouseenter', layerId, () => {
						map.getCanvas().style.cursor = 'help';
					});

					map.on('mouseleave', layerId, () => {
						map.getCanvas().style.cursor = '';
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
							new maplibregl.Popup()
								.setLngLat(popupAnchor(e.features[0], e.lngLat))
								.setDOMContent(popupContainer)
								.addTo(map);
						}

						const geom = e.features[0].geometry;
						if (geom.type === 'Point') {
							map.flyTo({ center: geom.coordinates, zoom: 15, pitch: 30, essential: true });
						} else {
							const bbox = geometryBbox(geom);
							if (bbox) map.fitBounds(bbox, { padding: 60, maxZoom: 15 });
						}
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
						exaggeration: 0.00009
					});

					map.addControl(
						new maplibregl.TerrainControl({
							source: layer.name,
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
					// A .json url is a TileJSON (e.g. VersaTiles Shortbread); otherwise a tile template
					// Layers with the same "source" share one tile source (tiles fetched once)
					const vectorSourceId = layer.source ?? layer.name;
					if (!map.getSource(vectorSourceId)) map.addSource(vectorSourceId, layer.url.split('?')[0].endsWith('.json')
						? { type: 'vector', url: layer.url }
						: {
								type: 'vector',
								tiles: [layer.url],
								scheme: layer.scheme ?? 'tms',
								// lets MapLibre overzoom past the source's last tile level
								...(layer.maxzoom != null && { maxzoom: layer.maxzoom })
							});

					// "sprite": { "id": "base", "url": "..." } adds an icon set, used as "base:icon-name"
					if (layer.sprite && !map.getSprite().some((s) => s.id === layer.sprite.id)) {
						map.addSprite(layer.sprite.id, layer.sprite.url);
					}

					if (layer.layers_spec) {
						// MapLibre layer objects from the config; each sets its own source-layer
						const ids = layer.layers_spec.map((spec, i) => {
							const id = `${layer.name}_layer_${i}`;
							map.addLayer({ ...spec, id, source: vectorSourceId });
							return id;
						});

						// "hover": "kind" shows that feature property in a tooltip
						if (layer.hover) {
							const tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'hover-tip' });
							map.on('mousemove', ids, (e) => {
								const f = e.features?.[0];
								// "hover" is one property name or a list; shows those that are set
								const value = [layer.hover].flat()
									.map((k) => f?.properties?.[k])
									.filter((v) => v != null && v !== '')
									.join(' · ');
								if (!value) return tip.remove();
								map.getCanvas().style.cursor = 'pointer';
								tip.setLngLat(e.lngLat)
									.setText(`${f.sourceLayer.replace(/_/g, ' ')}: ${String(value).replace(/_/g, ' ')}`)
									.addTo(map);
							});
							map.on('mouseleave', ids, () => {
								map.getCanvas().style.cursor = '';
								tip.remove();
							});
						}
					} else if (layer.layer_names && Array.isArray(layer.layer_names)) {
						layer.layer_names.forEach((source_layer) => {
							map.addLayer({
								id: layer.name + '_layer_' + source_layer,
								type: 'line',
								source: layer.name,
								'source-layer': source_layer,
								paint: layer.style?.line ?? {
									'line-color': layer.color ?? '#000000',
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
								...(layer.style?.symbol_layout ?? { 'text-size': 12, 'text-offset': [0, 1] })
							},
							paint: layer.style?.symbol ?? {
								'text-color': '#000'
							}
						});
					}
				}

				// Grouped layers (legend_group) show if the group or any member is listed
				const urlNames = urlLayers?.split(',');
				const groupMembers = layer.legend_group
					? data.content.layers.filter((l) => l.legend_group === layer.legend_group).map((l) => l.name)
					: [layer.name];
				const shouldBeVisible = urlNames
					? urlNames.includes(layer.legend_group) || groupMembers.some((n) => urlNames.includes(n))
					: layer.visible;
				
				// Set visibility only on map layers that were actually created for this config layer
				const prefix = layer.name + '_layer';
				map.getStyle().layers
					.filter((l) => l.id === prefix || l.id.startsWith(prefix + '_'))
					.forEach((l) =>
						map.setLayoutProperty(l.id, 'visibility', shouldBeVisible ? 'visible' : 'none')
					);

				// Always-open article cards ("cards": { "max": 5 }) for loader layers
				if (layer.cards && loaded.has(layer.name)) {
					enableStoryCards(map, maplibregl.Popup, layer.name, loaded.get(layer.name), layer.cards);
				}
			  } catch (err) {
				console.error(`Failed to add layer "${layer.name}":`, err);
			  }
			});
		});
	});
</script>

<svelte:head>
	<title>{data.content.name} — PGSL</title>
	<meta name="description" content={data.content.short_desc} />
	<meta property="og:title" content={data.content.name} />
	<meta property="og:description" content={data.content.short_desc} />
	<meta property="og:url" content={page.url.href} />
	<meta property="og:type" content="website" />
</svelte:head>

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
				<Drawer.Content class="bg-gray-200 max-h-[70svh] flex flex-col overflow-hidden">
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