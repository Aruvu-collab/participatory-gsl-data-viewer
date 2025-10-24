<!-- PropertiesPanel.svelte -->
<script>
	export let selectedFeature = null;
	import { Dialog } from 'bits-ui';
	// Separate image and non-image properties
	$: imageProperties = selectedFeature
		? Object.entries(selectedFeature.properties || {}).filter(
				([key, value]) =>
					key.toLowerCase().includes('s') &&
					value !== null &&
					value !== '' &&
					value.toString().toLowerCase().includes('dcim/') &&
					!key.startsWith('_')
			)
		: [];
	$: nonImageProperties = selectedFeature
		? Object.entries(selectedFeature.properties || {})
				.filter(
					([key, value]) =>
						!key.toLowerCase().includes('picture') &&
						value !== null &&
						value !== '' &&
						!key.startsWith('_')
				)
				.sort(([a], [b]) => a.localeCompare(b))
		: [];
	function formatKey(key) {
		return key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
	}
	function formatValue(value) {
		if (typeof value === 'number') {
			return value % 1 === 0 ? value.toString() : value.toFixed(4);
		}
		return value;
	}
	function getName(properties) {
		let name_well = '';
		try {
			name_well = nonImageProperties.find((e = properties) =>
				e.toString().toLocaleLowerCase().includes('name')
			)[1];
		} catch {
			name_well = 'Unnamed well';
		}
		return name_well;
	}
	let lightboxSrc;
	$: lightboxSrc = lightboxSrc;
</script>

{#key lightboxSrc}
	{#if lightboxSrc?.length >= 3}
		<Dialog.Root open>
			<Dialog.Portal>
				<Dialog.Overlay
					class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/80"
				/>
				<Dialog.Content
					class="rounded-card-lg bg-background shadow-popover fixed top-[50%] left-[50%] z-50 w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] border p-5 outline-hidden sm:max-w-[490px] md:w-full"
					forceMount
				>
					<Dialog.Title
						class="flex w-full items-center justify-center text-lg font-semibold tracking-tight"
					></Dialog.Title>
					<Dialog.Description class="text-foreground-alt text-sm">
						<div class="flex flex-col items-start gap-1 pt-7 pb-11">
							<img
								src={lightboxSrc}
								alt="Full size"
								class="max-h-[90vh] max-w-[90vw] object-contain"
							/>
						</div>
					</Dialog.Description>

					<Dialog.Close
						class="focus-visible:ring-foreground focus-visible:ring-offset-background absolute top-5 right-5 rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden active:scale-[0.98]"
					>
						<div>
							<span class="sr-only">Close</span>
						</div>
					</Dialog.Close>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	{/if}
{/key}

<div class="mx-auto flex h-auto w-full flex-col overflow-y-scroll bg-white md:h-[40vh] md:w-[50vw]">
	<div class="space-y-4">
		<!-- Feature Title -->
		<div class="border-b border-gray-200 pb-4">
			<h2 class="text-lg font-semibold text-gray-900">{getName(nonImageProperties)}</h2>
			<pre class="overflow-x-auto font-mono text-xs text-gray-600">{JSON.stringify(
					selectedFeature.geometry.coordinates,
					null,
					0
				)}</pre>
		</div>
		<div class=" md:grid-rows-5">
			<!-- Images Grid -->
			{#if imageProperties.length > 0}
				<div class="rounded-lg border border-gray-200 bg-white shadow-sm md:row-span-3">
					<div class="md:flex-column space-y-4 overflow-y-auto p-1 md:flex">
						{#each imageProperties as [key, filename]}
							<div class="space-y-2">
								<div
									class="aspect-square cursor-pointer"
									on:click={() => {
										lightboxSrc = `https://minio.livinglabs.network/pgsl-site/${filename.replace('DCIM/', '')}`;
									}}
								>
									<img
										src="https://minio.livinglabs.network/pgsl-site/{filename.replace('DCIM/', '')}"
										alt={key}
										class="min-h-full min-w-full rounded-md border border-gray-200 object-cover"
										on:error={(e) => {
											e.target.parentElement.innerHTML =
												'<div class="flex items-center justify-center h-full text-gray-500 text-sm">Image not found</div>';
										}}
									/>
									<span
										class="fixed bottom-0 left-0 inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800"
									>
										{formatKey(key)}
									</span>
								</div>
								<div class="text-center"></div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
			<!-- Properties Table -->
			{#if nonImageProperties.length > 0}
				<div
					class="row-span-2 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
				>
					<div class="h-auto overflow-y-auto">
						{#each nonImageProperties as [key, value], index}
							<div
								class="flex items-start gap-3 border-b border-gray-100 transition-colors last:border-b-0 hover:bg-gray-50 {index %
									2 ===
								0
									? 'bg-white'
									: 'bg-gray-50'}"
							>
								<div class="min-w-0 text-sm font-medium text-gray-600">
									{formatKey(key)}
								</div>
								<div class="min-w-0 text-right text-sm break-words text-gray-900">
									{formatValue(value)}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	:global {
		.maplibregl-popup {
			max-width: 70vw !important;
		}
	}
</style>
