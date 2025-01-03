<script lang="ts">
	import samagraArogya from '../contents/samagra-arogya.json';
	import karez from '../contents/karez.json';
	import ennore from '../contents/ennore.json';

	import * as Collapsible from '$lib/components/ui/collapsible';
	let list: Array<any> = [karez, samagraArogya, ennore];
	let screenWidth: number = 0;
</script>

<svelte:window bind:innerWidth={screenWidth} />

<div class="w-screen p-10 shadow-xl md:h-screen">
	<h1 class="text-bold font-serif font-bold md:text-xl">
		The Participatory Geospatial Lab at Aruvu Collaboratory
	</h1>

	<div class="w-full md:mt-10">
		<!-- dependant on screen size, make this collapsible-->
		{#if screenWidth > 768}
			<div class="font-bold"><h2>Places</h2></div>
			{#each list as listElement}
				<a data-sveltekit-reload href="/{listElement.slug}"><li>{listElement.name}</li></a>
			{/each}
		{:else}
			<Collapsible.Root>
				<Collapsible.Trigger class="mt-3 w-full bg-gray-100 px-4 font-bold"
					>Places ↓</Collapsible.Trigger
				>
				<Collapsible.Content>
					{#each list as listElement}
						<a data-sveltekit-reload href="/{listElement.slug}"><li>{listElement.name}</li></a>
					{/each}
				</Collapsible.Content>
			</Collapsible.Root>
		{/if}
	</div>
</div>

<style lang="postcss">
	li {
		@apply m-1 cursor-pointer list-none bg-gray-100 p-1 hover:bg-gray-200;
	}
</style>
