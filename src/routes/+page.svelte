<script lang="ts">
	import LeftBar from '$lib/components/LeftBar.svelte';
</script>

<svelte:head>
	<title>Participatory Geospatial Lab</title>
	<meta name="description" content="Collaborative geospatial maps and data from the Participatory Geospatial Lab." />
	<meta property="og:title" content="Participatory Geospatial Lab" />
	<meta property="og:description" content="Collaborative geospatial maps and data from the Participatory Geospatial Lab." />
	<meta property="og:type" content="website" />
</svelte:head>

<div class="grid grid-cols-10 ">
	<section class="col-span-10 md:col-span-4">
		<LeftBar />
	</section>
	<section id="main-carousel" class="col-span-10 md:col-span-6 h-screen p-10">
	</section>
</div>

<style>
#main-carousel {
	background-image: url('/bg.webp');
	background-size: cover;
}

</style>