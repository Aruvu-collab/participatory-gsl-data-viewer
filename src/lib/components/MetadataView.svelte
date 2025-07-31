<!-- PropertiesPanel.svelte -->
<script>
	export let selectedFeature = null;
	// Separate image and non-image properties
	$: imageProperties = selectedFeature 
		? Object.entries(selectedFeature.properties || {}).filter(([key, value]) => 
			key.toLowerCase().includes('s') && 
			value !== null && 
			value !== '' && 
            value.toString().toLowerCase().includes('dcim/') &&
			!key.startsWith('_')
		) 
		: [];

	
	$: nonImageProperties = selectedFeature 
		? Object.entries(selectedFeature.properties || {}).filter(([key, value]) => 
			!key.toLowerCase().includes('picture') && 
			value !== null && 
			value !== '' && 
			!key.startsWith('_')
		).sort(([a], [b]) => a.localeCompare(b))
		: [];
	
	function formatKey(key) {
		return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
	}
	
	function formatValue(value) {
		if (typeof value === 'number') {
			return value % 1 === 0 ? value.toString() : value.toFixed(4);
		}
		return value;
	}

    function getName(properties){
        
        let name_well = ''
        try{
        name_well = nonImageProperties.find((e = properties)=> e.toString().toLocaleLowerCase().includes('name'))[1]
        } catch{
        name_well="Unnamed well"
        }
        
        return name_well
    }
</script>

<div class="w-full mx-auto max-h-[70vh] md:max-h-screen bg-white border-l border-gray-200 flex flex-col overflow-y-scroll p-3 ">
	{#if selectedFeature}
		<div class="p-4 space-y-4">
			<!-- Feature Title -->
			<div class="border-b border-gray-200 pb-4">
				<h2 class="text-lg font-semibold text-gray-900">{getName(nonImageProperties)}</h2>
                
				<p class="text-sm text-gray-500 mt-1">
					{selectedFeature.geometry?.type || 'Unknown'} feature
				</p>
			</div>
			
			<!-- Images Grid -->
			{#if imageProperties.length > 0}
				<div class="bg-white border border-gray-200 rounded-lg shadow-sm ">
					<div class="bg-gray-50 px-4 py-3 border-b border-gray-200">
						<h3 class="text-sm font-semibold text-gray-900">Images</h3>
					</div>
					<div class="p-4 space-y-4 overflow-y-auto">
						{#each imageProperties as [key, filename]}
							<div class="space-y-2">
								<div class="aspect-square">
									<img 
										src="https://minio.livinglabs.network/pgsl-site/{filename.replace('DCIM/','')}" 
										alt={key} 
										class="rounded-md object-cover w-full h-full border border-gray-200"
										on:error={(e) => {
											e.target.parentElement.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500 text-sm">Image not found</div>';
										}}
									/>
								</div>
								<div class="text-center">
									<span class="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
										{formatKey(key)}
									</span>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
			
			<!-- Properties Table -->
			{#if nonImageProperties.length > 0}
				<div class="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
					<div class="bg-gray-50 px-4 py-3 border-b border-gray-200">
						<h3 class="text-sm font-semibold text-gray-900">Properties</h3>
					</div>
					<div class="max-h-96 overflow-y-auto">
						{#each nonImageProperties as [key, value], index}
							<div class="flex items-start gap-3 p-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors {index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
								<div class="font-medium text-sm text-gray-600 min-w-0 flex-1">
									{formatKey(key)}
								</div>
								<div class="text-sm text-gray-900 min-w-0 flex-1 text-right break-words">
									{formatValue(value)}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
			
			<!-- Coordinates (if available) -->
			{#if selectedFeature.geometry?.coordinates}
				<div class="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
					<div class="bg-gray-50 px-4 py-3 border-b border-gray-200">
						<h3 class="text-sm font-semibold text-gray-900">Coordinates</h3>
					</div>
					<div class="p-4">
						<pre class="text-xs font-mono text-gray-600 whitespace-pre-wrap overflow-x-auto">{JSON.stringify(selectedFeature.geometry.coordinates, null, 2)}</pre>
					</div>
				</div>
			{/if}
		</div>
	{:else}
		<div class="flex items-center justify-center h-full text-center p-8">
			<div class="space-y-2">
				<div class="text-gray-400">
					<svg class="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
					</svg>
				</div>
				<h3 class="font-medium text-gray-900">No Feature Selected</h3>
				<p class="text-sm text-gray-500">Click on a map feature to view its properties. Not all features are supported.</p>
			</div>
		</div>
	{/if}
</div>