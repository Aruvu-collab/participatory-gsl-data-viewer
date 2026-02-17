<script lang="ts">
	import samagraArogya from '../contents/samagra-arogya.json';
	import karez from '../contents/karez.json';
	import alur from '../contents/alur-kundapura-infrastructure.json';
	import wells from '../contents/wells-stepwells-bidar-district.json';
	import { onMount } from 'svelte';

	import * as Collapsible from '$lib/components/ui/collapsible';
	let list: Array<any> = [karez, samagraArogya, wells, alur];
	let screenWidth: number = 0;
	let pgslPosts: Array<any> = [];
	let loading = true;
	let error = '';

	onMount(async () => {
		try {
			// Ghost Content API endpoint
			const response = await fetch(
				'https://untold.town/ghost/api/content/posts/?key=118485e791e69afcff3d060037&filter=tag:participatory-geospatial-lab&limit=4&fields=title,url,published_at,feature_image'
			);

			if (!response.ok) {
				throw new Error('Failed to fetch posts');
			}

			const data = await response.json();
			pgslPosts = data.posts || [];
		} catch (err) {
			error = 'Unable to load blog posts';
			console.error(err);
		} finally {
			loading = false;
		}
	});
</script>

<svelte:window bind:innerWidth={screenWidth} />

<div class="w-screen p-10 shadow-xl md:h-screen md:w-auto overflow-y-auto">
	<header class="sticky top-0 bg-white ">
	<h1 class="text-bold font-serif font-bold text-black md:text-3xl ">
		the <span class="bg-pink-600 text-white px-2">Participatory Geospatial Lab</span> at Aruvu Collaboratory
	</h1>
	<p class="text-md bold mt-4">
		This website represents the work of <a href="https://aruvu.org" target="_blank"
			>Aruvu Collaboratory</a
		>, <a href="https://livinglabs.network" target="_blank">Living Labs Network and Forum</a>,
		<a href="https://untold.town/team-yuvaa/" target="_blank">Team YUVAA</a>. The Collectives
		publish their work on the web at <a href="https://untold.town" target="_blank">Untold.Town</a>
	</p>
	</header>
	<hr class="m-6" />
	<div class="w-full">
		<!-- dependant on screen size, make this collapsible-->
		<h3 class="text-lg font-bold">Collections:</h3>
		<p class="text-xs">Each collection is linked to a long term engagement of the collectives</p>
		<ul class="my-2">
			{#each list as listElement}
				<a data-sveltekit-reload href="/{listElement.slug}"
					><li
						class="m-1 block rounded-lg bg-pink-800 p-2  font-bold font-serif"
					>
						{listElement.name}
						<p class="text-xs my-1 ml-1 font-sans font-normal">{listElement.short_desc}</p>
					</li>
				</a>
			{/each}
		</ul>
	</div>

	<hr class="m-6" />

	<div class="h-auto mt-4">
		<h3 class="text-lg font-bold">Recent Blogs:</h3>
		<p class="text-xs">Posts will redirect to untold.town, our online journal</p>
		{#if loading}
			<p class="text-sm text-gray-600">Loading posts...</p>
		{:else if error}
			<p class="text-sm text-red-600">{error}</p>
		{:else if pgslPosts.length > 0}
			<div class=" my-2 ">
				<ul class="space-y-1">
					{#each pgslPosts as post}
						<a
							href={post.url}
							target="_blank"
							class="block font-bold font-serif text-blue-600 hover:text-blue-800"
						>
							<li class="flex gap-3 rounded p-2 transition-colors">
								{#if post.feature_image}
									<img
										src={post.feature_image}
										alt={post.title}
										class="h-20 w-40 md:w-50 md:h-30 flex-shrink-4 rounded object-cover"
									/>
								{:else}
									<div
										class="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded bg-gray-200"
									>
										<span class="text-xs text-gray-400">No image</span>
									</div>
								{/if}
								<div class="w-20 flex-1">
									{post.title}

									<span class="mt-1 block text-xs text-gray-200">
										{new Date(post.published_at).toLocaleDateString()}
									</span>
								</div>
							</li>
						</a>
					{/each}
				</ul>
			</div>
		{:else}
			<p class="text-sm text-gray-600">No posts found with tag "pgsl"</p>
		{/if}
	</div>
</div>

<style lang="postcss">
	@reference "tailwindcss";
	li {
		@apply m-1 cursor-pointer list-none rounded-sm bg-neutral-300 p-2 hover:bg-gray-200;
	}

	p > a {
		@apply underline;
	}

	a {
		@apply hover:bg-blue-200;
	}

	li{
  @apply bg-pink-800 !text-white;
}

a li {
  @apply !text-white hover:bg-pink-600 hover:text-black;
}

</style>
