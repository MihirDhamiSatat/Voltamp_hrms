<template>
	<div v-if="status || hasCoordinates" class="flex flex-col gap-1.5 -mt-1">
		<span v-if="status" class="text-sm text-gray-500">{{ status }}</span>

		<div v-if="hasCoordinates" class="rounded border overflow-hidden w-full">
			<iframe
				:title="__('Location map')"
				width="100%"
				height="170"
				frameborder="0"
				scrolling="no"
				style="border: 0"
				:src="mapSrc"
			></iframe>
			<div class="text-xs text-gray-500 px-2 py-1.5 bg-gray-50">
				{{ Number(latitude).toFixed(5) }}, {{ Number(longitude).toFixed(5) }}
				<span class="whitespace-pre"> &middot; </span>
				<a :href="largeMapUrl" target="_blank" rel="noopener" class="underline">
					{{ __("Open larger map") }}
				</a>
			</div>
		</div>
	</div>
</template>

<script setup>
import { computed, inject } from "vue"

const __ = inject("$translate")

const props = defineProps({
	latitude: [Number, String],
	longitude: [Number, String],
	status: {
		type: String,
		default: "",
	},
})

const hasCoordinates = computed(() => {
	return props.latitude !== null && props.latitude !== undefined && props.latitude !== ""
		&& props.longitude !== null && props.longitude !== undefined && props.longitude !== ""
})

const mapSrc = computed(() => {
	const lat = Number(props.latitude)
	const lng = Number(props.longitude)
	const d = 0.01
	const bbox = [lng - d, lat - d, lng + d, lat + d].join("%2C")
	return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`
})

const largeMapUrl = computed(() => {
	return `https://www.openstreetmap.org/?mlat=${props.latitude}&mlon=${props.longitude}#map=16/${props.latitude}/${props.longitude}`
})
</script>
