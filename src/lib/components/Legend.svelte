<script lang="ts">
	export let map;
	export let data;
	function handleVisibilityChange(layer: any) {
		if (map) {
			map.setLayoutProperty(
				layer.name + '_layer',
				'visibility',
				layer.visible ? 'visible' : 'none'
			);
		}
	}
</script>

{#each data.content.layers as layer}
	<div class="">
		<div class="my-2 grid grid-cols-5">
			<div class="col-span-4 text-left">
				<h3>{layer.name}</h3>
				<p class="text-xs">
					Lorem Ipsum is simply dummy text of the printing and typesetting industry.
				</p>
			</div>
			<div class="my-auto px-5 align-middle">
				<input
					type="checkbox"
					id={layer.name}
					bind:checked={layer.visible}
					onchange={() => {
						handleVisibilityChange(layer);
					}}
					aria-checked={layer.visible}
				/>
			</div>
		</div>
	</div>
{/each}
