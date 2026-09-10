<template>
	<CustomIonModal :isOpen="isOpen" @did-dismiss="handleDismiss">
		<template #actionSheet>
			<div class="bg-white w-full flex flex-col items-center pb-6">
				<div class="w-full pt-6 px-4 pb-4 border-b text-center">
					<span class="text-gray-900 font-bold text-lg">{{ __("Voice Note") }}</span>
				</div>

				<div class="w-full flex flex-col items-center gap-5 p-6">
					<div class="text-3xl font-mono tracking-wide text-gray-800">{{ formattedDuration }}</div>

					<p v-if="permissionError" class="text-sm text-red-600 text-center">
						{{ permissionError }}
					</p>

					<audio v-if="previewUrl" :src="previewUrl" controls class="w-full" />

					<div class="flex flex-row items-center gap-4">
						<template v-if="state === 'idle'">
							<Button
								variant="solid"
								theme="red"
								icon="mic"
								size="2xl"
								class="!rounded-full !h-16 !w-16"
								:aria-label="__('Start Recording')"
								@click="start"
							/>
						</template>

						<template v-else-if="state === 'recording' || state === 'paused'">
							<Button
								variant="outline"
								icon="trash-2"
								size="xl"
								class="!rounded-full"
								:aria-label="__('Discard')"
								@click="discard"
							/>
							<Button
								variant="solid"
								theme="red"
								:icon="state === 'recording' ? 'pause' : 'mic'"
								size="2xl"
								class="!rounded-full !h-16 !w-16"
								:aria-label="state === 'recording' ? __('Pause') : __('Resume')"
								@click="state === 'recording' ? pause() : resume()"
							/>
							<Button
								variant="outline"
								icon="stop-circle"
								size="xl"
								class="!rounded-full"
								:aria-label="__('Stop')"
								@click="stop"
							/>
						</template>

						<template v-else-if="state === 'stopped'">
							<Button variant="outline" class="py-5 px-5" @click="discard">
								{{ __("Discard") }}
							</Button>
							<Button variant="solid" class="py-5 px-5" @click="save">
								{{ __("Save") }}
							</Button>
						</template>
					</div>

					<span class="text-xs text-gray-500" v-if="state === 'recording'">{{ __("Recording…") }}</span>
					<span class="text-xs text-gray-500" v-else-if="state === 'paused'">{{ __("Paused") }}</span>
				</div>
			</div>
		</template>
	</CustomIonModal>
</template>

<script setup>
import { ref, computed, watch, inject, onBeforeUnmount } from "vue"

import CustomIonModal from "@/components/CustomIonModal.vue"

const __ = inject("$translate")

const props = defineProps({
	isOpen: {
		type: Boolean,
		default: false,
	},
})
const emit = defineEmits(["did-dismiss", "save"])

// idle -> recording -> (paused <-> recording) -> stopped
const state = ref("idle")
const permissionError = ref("")
const previewUrl = ref("")
const elapsedSeconds = ref(0)

let mediaStream = null
let recorder = null
let chunks = []
let timer = null
let recordedBlob = null

const formattedDuration = computed(() => {
	const minutes = Math.floor(elapsedSeconds.value / 60).toString().padStart(2, "0")
	const seconds = (elapsedSeconds.value % 60).toString().padStart(2, "0")
	return `${minutes}:${seconds}`
})

function extensionForMimeType(mimeType) {
	if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a"
	if (mimeType.includes("ogg")) return "ogg"
	if (mimeType.includes("wav")) return "wav"
	return "webm"
}

async function start() {
	permissionError.value = ""

	if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
		permissionError.value = __("Your browser doesn't support audio recording.")
		return
	}

	try {
		mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
	} catch (error) {
		permissionError.value = __(
			"Microphone access was denied. Please allow microphone access in your browser settings and try again."
		)
		return
	}

	chunks = []
	elapsedSeconds.value = 0
	recorder = new MediaRecorder(mediaStream)
	recorder.ondataavailable = (event) => {
		if (event.data && event.data.size) chunks.push(event.data)
	}
	recorder.onstop = () => {
		const mimeType = recorder.mimeType || "audio/webm"
		recordedBlob = new Blob(chunks, { type: mimeType })
		previewUrl.value = URL.createObjectURL(recordedBlob)
		state.value = "stopped"
	}

	recorder.start()
	state.value = "recording"
	timer = setInterval(() => (elapsedSeconds.value += 1), 1000)
}

function pause() {
	if (!recorder || typeof recorder.pause !== "function") return
	recorder.pause()
	state.value = "paused"
	clearInterval(timer)
}

function resume() {
	if (!recorder || typeof recorder.resume !== "function") return
	recorder.resume()
	state.value = "recording"
	timer = setInterval(() => (elapsedSeconds.value += 1), 1000)
}

function stop() {
	clearInterval(timer)
	if (recorder && recorder.state !== "inactive") recorder.stop()
	releaseStream()
}

function releaseStream() {
	mediaStream?.getTracks().forEach((track) => track.stop())
	mediaStream = null
}

function resetState() {
	clearInterval(timer)
	releaseStream()
	recorder = null
	chunks = []
	recordedBlob = null
	if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
	previewUrl.value = ""
	elapsedSeconds.value = 0
	permissionError.value = ""
	state.value = "idle"
}

function discard() {
	if (recorder && recorder.state !== "inactive") {
		// onstop would otherwise flip this to "stopped" - skip straight to idle.
		recorder.onstop = null
		recorder.stop()
	}
	resetState()
}

function save() {
	if (!recordedBlob) return
	const filename = `voice-note-${Date.now()}.${extensionForMimeType(recordedBlob.type)}`
	emit("save", { blob: recordedBlob, filename })
	resetState()
}

function handleDismiss() {
	// Closing mid-recording must release the mic instead of leaving it
	// captured in the background - mirrors the Desk dialog's own
	// hidden.bs.modal handler (public/js/work_evidence.js: _stop_recording).
	if (state.value === "recording" || state.value === "paused") discard()
	else resetState()
	emit("did-dismiss")
}

watch(
	() => props.isOpen,
	(open) => {
		if (!open) resetState()
	}
)

onBeforeUnmount(() => {
	releaseStream()
	if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})
</script>
