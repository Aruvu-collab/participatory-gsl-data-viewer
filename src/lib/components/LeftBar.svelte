<script lang="ts">
	import samagraArogya from '../contents/samagra-arogya.json';
	import karez from '../contents/karez.json';
	import alur from '../contents/alur-kundapura-infrastructure.json';
	import wells from '../contents/wells-stepwells-bidar-district.json';

	import * as Collapsible from '$lib/components/ui/collapsible';
	let list: Array<any> = [karez, samagraArogya, wells, alur];
	let screenWidth: number = 0;
</script>

<svelte:window bind:innerWidth={screenWidth} />

<div class="w-screen p-10 shadow-xl md:h-screen md:w-auto">
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

	<hr class='mb-4'>
	<p class="text-xs mt-4">
		This website represents the work of <a href="https://aruvu.org" target="_blank">Aruvu Collaboratory</a>, <a href="https://untold.town/living-labs-network-and-forum/" target="_blank">Living Labs Network and Forum</a>, <a href="https://untold.town/team-yuvaa/" target="_blank">Team YUVAA</a>. The Collectives publish their work on the web at <a href="https://untold.town" target="_blank">Untold.Town</a>	
	</p>
</div>

<style lang="postcss">
	li {
		@apply m-1 cursor-pointer list-none bg-neutral-300 p-2 rounded-sm hover:bg-gray-200;
	};

	p > a{
		@apply underline 
	}

	a{
		@apply hover:bg-blue-200
	}
</style>
