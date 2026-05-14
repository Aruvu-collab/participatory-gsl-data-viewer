<script lang="ts">
	import '../app.css';
	let { children } = $props();
</script>

<svelte:head>
	<meta property="og:site_name" content="The Participatory Geospatial Lab" />
	<meta property="og:image" content="/bg.webp" />
	<meta name="twitter:card" content="summary" />
</svelte:head>

{@render children()}
