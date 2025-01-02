<script lang="ts">
	import samagraArogya from '../lib/contents/samagra-arogya.json';
	import karez from '../lib/contents/karez.json';
	import ennore from '../lib/contents/ennore.json';

	let list: Array<any> = [karez, samagraArogya, ennore];
</script>

<div class="h-screen p-10 shadow-xl">
	<h1 class="font-serif text-xl font-bold">
		The Participatory Geospatial Lab at Aruvu Collaboratory
	</h1>

	<div class="mt-10">
		<div class="font-bold"><h2>Places</h2></div>
		{#each list as listElement}
			<a data-sveltekit-reload href="/{listElement.slug}"><li>{listElement.name}</li></a>
		{/each}
	</div>
</div>

<style lang="postcss">
	li {
		@apply m-1 cursor-pointer list-none bg-gray-100 p-1 hover:bg-gray-200;
	}
</style>
