<!-- Always-open article card for Ghost loader layers (mounted into a maplibre Popup) -->
<script lang="ts">
	let { properties }: { properties: Record<string, any> } = $props();
	const p = properties;
	const thumb = p.feature_image?.includes('/content/images/')
		? p.feature_image.replace('/content/images/', '/content/images/size/w400/')
		: p.feature_image;
</script>

<a class="story-card" href={p.url} target="_blank" rel="noopener">
	{#if thumb}<img src={thumb} alt="" />{/if}
	<!-- {#if p.place && p.place !== p.title}<span class="place">{p.place}</span>{/if} -->
	<span class="title">{p.title}</span>
</a>

<style>
	/* Popup chrome lives outside this component, so it must be global */
	:global(.story-card-popup .maplibregl-popup-content) {
		padding: 0;
		border-radius: 8px;
		overflow: hidden;
	}
	/* Close button floats over the image */
	:global(.story-card-popup .maplibregl-popup-close-button) {
		z-index: 1;
		width: 22px;
		height: 22px;
		margin: 4px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.9);
		font-size: 16px;
		line-height: 1;
	}
	:global(.story-card-popup .maplibregl-popup-close-button:hover) {
		background: #fff;
	}
	/* The page hides maplibre popups on mobile (bottom sheet); keep these cards */
	@media (max-width: 768px) {
		:global(.maplibregl-popup.story-card-popup) {
			display: flex;
		}
	}

	.story-card {
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 180px;
		height: 120px;
		text-decoration: none;
		color: #111;
		opacity: 90%;
	}
	img {
		width: 100%;
		height: 70px;
		object-fit: cover;
	}
	.place {
		padding: 4px 8px 0;
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #6b7280;
	}
	.title {
		padding: 2px 8px 8px;
		font-size: 11px;
		font-weight: 600;
		line-height: 1.3;
		display: -webkit-box;
		-webkit-line-clamp: 5;
		line-clamp: 5;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.story-card:hover .title {
		text-decoration: underline;
	}
</style>
