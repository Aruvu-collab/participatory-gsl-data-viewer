<script lang="ts">
	import LeftBar from '$lib/components/LeftBar.svelte';
</script>

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