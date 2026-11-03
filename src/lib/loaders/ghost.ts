// Ghost (untold.town) stories as a GeoJSON layer.
// Editors geotag a post in Ghost → Post settings → Code injection → Post header:
//   <meta name="geo.point" content="lat;lng;Optional label">   (repeatable)
//   <meta name="geo.position" content="lat;lng">               (single point)
import type maplibregl from 'maplibre-gl';
import { mount } from 'svelte';
import StoryCard from '$lib/components/StoryCard.svelte';

export type GhostConfig = { url: string; key: string; filter?: string };
export type ThumbOptions = { size?: number; border?: string; shape?: 'circle' | 'square' };

type Feature = {
	type: 'Feature';
	geometry: { type: 'Point'; coordinates: [number, number] };
	properties: Record<string, any>;
};
export type FeatureCollection = { type: 'FeatureCollection'; features: Feature[] };

function parsePoints(head: string | null, title: string) {
	if (!head) return [];
	const doc = new DOMParser().parseFromString(head, 'text/html');
	const metas = doc.querySelectorAll('meta[name="geo.point"], meta[name="geo.position"]');
	const points: { lng: number; lat: number; label?: string }[] = [];
	metas.forEach((m) => {
		// "lat;lng;label" — lat and lng may also be separated by a comma ("lat,lng;label")
		const match = (m.getAttribute('content') ?? '').match(
			/^\s*(-?\d+(?:\.\d+)?)\s*[;,]\s*(-?\d+(?:\.\d+)?)\s*(?:;(.*))?$/s
		);
		let lat = match ? parseFloat(match[1]) : NaN;
		let lng = match ? parseFloat(match[2]) : NaN;
		const rest = [match?.[3] ?? ''];
		// Common mistake: lng;lat order (GIS convention). Swap if only that order is valid.
		if (Math.abs(lat) > 90 && Math.abs(lng) <= 90 && Math.abs(lat) <= 180) {
			console.warn(`Ghost post "${title}": "${m.getAttribute('content')}" looks like lng;lat — swapping. Use lat;lng.`);
			[lat, lng] = [lng, lat];
		}
		if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
			console.warn(`Ghost post "${title}": bad ${m.getAttribute('name')} "${m.getAttribute('content')}"`);
			return;
		}
		const label = rest.join(';').trim();
		points.push({ lat, lng, label: label || undefined });
	});
	return points;
}

export async function ghostToGeoJSON(cfg: GhostConfig): Promise<FeatureCollection> {
	const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
	const params = new URLSearchParams({
		key: cfg.key,
		limit: 'all',
		fields: 'id,title,url,published_at,feature_image,excerpt,codeinjection_head'
	});
	if (cfg.filter) params.set('filter', cfg.filter);
	const base = cfg.url.replace(/\/$/, '');
	try {
		const res = await fetch(`${base}/ghost/api/content/posts/?${params}`);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const { posts } = await res.json();
		const features: Feature[] = [];
		for (const p of posts ?? []) {
			for (const pt of parsePoints(p.codeinjection_head, p.title)) {
				features.push({
					type: 'Feature',
					geometry: { type: 'Point', coordinates: [pt.lng, pt.lat] },
					properties: {
						place: pt.label ?? p.title,
						title: p.title,
						url: p.url,
						published_at: p.published_at,
						feature_image: p.feature_image,
						excerpt: p.excerpt,
						post_id: p.id
					}
				});
			}
		}
		return { type: 'FeatureCollection', features };
	} catch (err) {
		console.error(`Ghost loader failed for ${base}:`, err);
		return empty;
	}
}

// Ghost serves resized images at /content/images/size/w{N}/...
function resizedUrl(src: string, width: number) {
	return src.includes('/content/images/') && !src.includes('/content/images/size/')
		? src.replace('/content/images/', `/content/images/size/w${width}/`)
		: src;
}

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});
}

function drawThumb(img: HTMLImageElement, px: number, border: string, shape: string) {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = px;
	const ctx = canvas.getContext('2d')!;
	const bw = Math.max(2, Math.round(px / 16));
	const clip = () => {
		ctx.beginPath();
		if (shape === 'square') ctx.rect(bw / 2, bw / 2, px - bw, px - bw);
		else ctx.arc(px / 2, px / 2, px / 2 - bw / 2, 0, Math.PI * 2);
	};
	ctx.save();
	clip();
	ctx.clip();
	// cover-crop
	const s = Math.min(img.width, img.height);
	ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, px, px);
	ctx.restore();
	clip();
	ctx.lineWidth = bw;
	ctx.strokeStyle = border;
	ctx.stroke();
	return ctx.getImageData(0, 0, px, px);
}

// Registers one map image per unique feature_image and sets properties.thumb on features.
// Features whose image is missing or fails to load get no `thumb` (rendered as fallback circles).
export async function addThumbnailImages(
	map: maplibregl.Map,
	layerName: string,
	fc: FeatureCollection,
	opts: ThumbOptions | true
) {
	const o = opts === true ? {} : opts;
	const size = o.size ?? 48;
	const px = size * 2; // pixelRatio 2 for sharpness
	const srcs = [...new Set(fc.features.map((f) => f.properties.feature_image).filter(Boolean))];
	const ids = new Map<string, string>();
	await Promise.allSettled(
		srcs.map(async (src, i) => {
			// Ghost only serves theme-configured widths; others redirect to the full original
			const w = [150, 400, 600].find((x) => x >= px) ?? 600;
			const img = await loadImage(resizedUrl(src, w));
			const id = `${layerName}_thumb_${i}`;
			if (!map.hasImage(id)) {
				map.addImage(id, drawThumb(img, px, o.border ?? '#ffffff', o.shape ?? 'circle'), {
					pixelRatio: 2
				});
			}
			ids.set(src, id);
		})
	);
	fc.features.forEach((f) => {
		const id = ids.get(f.properties.feature_image);
		if (id) f.properties.thumb = id;
	});
	return fc;
}

// Always-open article cards for up to `max` stories in the current view (newest first,
// one card per post). Re-syncs on map move and when the layer is toggled.
export function enableStoryCards(
	map: maplibregl.Map,
	Popup: typeof maplibregl.Popup,
	layerName: string,
	fc: FeatureCollection,
	opts: { max?: number } | true
) {
	const max = (opts === true ? undefined : opts.max) ?? 5;
	const open = new Map<string, maplibregl.Popup>();
	const dismissed = new Set<string>(); // post_ids closed by the user (until reload)
	const visible = () =>
		map
			.getStyle()
			.layers.some(
				(l) => l.id.startsWith(layerName + '_layer') && map.getLayoutProperty(l.id, 'visibility') !== 'none'
			);

	const sync = () => {
		const want = new Map<string, Feature>();
		if (visible()) {
			const b = map.getBounds();
			const seen = new Set<string>();
			fc.features
				.filter((f) => b.contains(f.geometry.coordinates))
				.sort((a, b) => String(b.properties.published_at).localeCompare(String(a.properties.published_at)))
				.forEach((f) => {
					const id = f.properties.post_id;
					if (want.size < max && !seen.has(id) && !dismissed.has(id)) {
						seen.add(id);
						want.set(id + '|' + f.geometry.coordinates.join(','), f);
					}
				});
		}
		for (const [k, p] of open) if (!want.has(k)) (open.delete(k), p.remove());
		for (const [k, f] of want) {
			if (open.has(k)) continue;
			const el = document.createElement('div');
			mount(StoryCard, { target: el, props: { properties: f.properties } });
			const popup = new Popup({ closeButton: true, closeOnClick: false, className: 'story-card-popup', offset: 30, maxWidth: '200px' })
				.setLngLat(f.geometry.coordinates)
				.setDOMContent(el);
			// 'close' also fires on programmatic remove(); only count it as user dismissal
			// if sync() hasn't already dropped it from `open`
			popup.on('close', () => {
				if (open.get(k) !== popup) return;
				open.delete(k);
				dismissed.add(f.properties.post_id);
				sync(); // let the next story take the freed slot
			});
			open.set(k, popup.addTo(map));
		}
	};
	map.on('moveend', sync);
	map.on('styledata', sync); // fires on visibility toggles
	sync();
}

export const loaders: Record<string, (cfg: any) => Promise<FeatureCollection>> = {
	ghost: ghostToGeoJSON
};
