<template>
	<CustomIonModal :isOpen="isOpen" @did-dismiss="handleDismiss">
		<template #actionSheet>
			<div class="bg-white w-full flex flex-col max-h-[85vh]">
				<div class="w-full pt-6 px-4 pb-4 border-b">
					<span class="text-gray-900 font-bold text-lg">{{ __("Work Evidence") }}</span>
				</div>

				<div class="flex flex-col gap-3 p-4 overflow-y-auto">
					<div v-if="loading && !items.length" class="flex items-center justify-center py-8">
						<LoadingIndicator class="w-6 h-6 text-gray-800" />
					</div>

					<EmptyState
						v-else-if="!items.length"
						:message="canWrite ? __('No evidence added yet.') : __('No evidence recorded yet.')"
					/>

					<div v-else class="grid grid-cols-2 gap-3">
						<div
							v-for="row in items"
							:key="row.name"
							class="flex flex-col gap-1.5 rounded-md border border-gray-200 p-2"
						>
							<img
								v-if="row.evidence_type === 'Photo'"
								:src="row.attachment"
								loading="lazy"
								class="h-28 w-full rounded object-cover cursor-pointer bg-gray-100"
								:alt="__('Photo evidence')"
								@click="openImage(row)"
							/>
							<div v-else class="flex flex-row items-center gap-2 bg-gray-50 rounded p-2">
								<FeatherIcon name="mic" class="h-4 w-4 text-gray-500 shrink-0" />
								<!-- preload="none": the browser fetches nothing until the user
									actually presses play on this specific row. -->
								<audio :src="row.attachment" controls preload="none" class="w-full h-8" />
							</div>

							<div class="text-[11px] leading-tight text-gray-500">
								<div>{{ __(row.evidence_type) }} &middot; {{ row.employee_name || row.employee || row.owner }}</div>
								<div>{{ dayjs(row.recorded_on).format("D MMM YYYY, h:mm a") }}</div>
							</div>

							<Button v-if="canWrite" variant="outline" theme="red" size="sm" @click="confirmDelete(row)">
								{{ __("Delete") }}
							</Button>
						</div>
					</div>

					<div v-if="items.length" class="flex flex-row items-center justify-between text-xs text-gray-500 pt-1">
						<span>{{ __("Showing {0} of {1}", [items.length, total]) }}</span>
						<Button v-if="items.length < total" variant="outline" size="sm" :loading="loadingMore" @click="loadMore">
							{{ __("Load More") }}
						</Button>
					</div>
				</div>

				<div class="p-4 border-t">
					<Button variant="subtle" class="w-full py-5" @click="handleDismiss">{{ __("Close") }}</Button>
				</div>
			</div>
		</template>
	</CustomIonModal>

	<!-- Full-size image only ever fetched here, on open - never in the grid above. -->
	<ion-modal :is-open="Boolean(previewImage)" @didDismiss="previewImage = null">
		<FilePreviewModal
			v-if="previewImage"
			:file="{ file_name: previewImage.evidence_type, file_url: previewImage.attachment }"
		/>
	</ion-modal>

	<Dialog v-model="showDeleteDialog">
		<template #body-title>
			<h2 class="text-lg font-bold">{{ __("Delete Evidence") }}</h2>
		</template>
		<template #body-content>
			<p>{{ __("Are you sure you want to delete this evidence? This cannot be undone.") }}</p>
		</template>
		<template #actions>
			<div class="flex flex-row gap-4">
				<Button variant="outline" class="py-5 w-full" @click="showDeleteDialog = false">
					{{ __("Cancel") }}
				</Button>
				<Button variant="solid" theme="red" class="py-5 w-full" :loading="deleting" @click="handleDelete">
					{{ __("Delete") }}
				</Button>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { ref, inject, watch } from "vue"
import { IonModal } from "@ionic/vue"
import { FeatherIcon, LoadingIndicator, Dialog, createResource, toast } from "frappe-ui"

import CustomIonModal from "@/components/CustomIonModal.vue"
import FilePreviewModal from "@/components/FilePreviewModal.vue"
import { WORK_EVIDENCE_METHODS, EVIDENCE_PAGE_LENGTH } from "@/composables/workEvidence"

const __ = inject("$translate")
const dayjs = inject("$dayjs")

const props = defineProps({
	isOpen: {
		type: Boolean,
		default: false,
	},
	referenceDoctype: {
		type: String,
		required: true,
	},
	referenceName: {
		type: String,
		required: true,
	},
	canWrite: {
		type: Boolean,
		default: false,
	},
})
const emit = defineEmits(["did-dismiss", "changed"])

const items = ref([])
const total = ref(0)
const start = ref(0)
const loading = ref(false)
const loadingMore = ref(false)
const previewImage = ref(null)
const showDeleteDialog = ref(false)
const deleting = ref(false)
let pendingDelete = null

const evidenceResource = createResource({ url: WORK_EVIDENCE_METHODS.getEvidence })
const deleteResource = createResource({ url: WORK_EVIDENCE_METHODS.deleteEvidence })

async function loadPage({ reset = false } = {}) {
	if (reset) {
		start.value = 0
		items.value = []
	}

	const isFirstLoad = start.value === 0
	if (isFirstLoad) loading.value = true
	else loadingMore.value = true

	try {
		const result = await evidenceResource.submit({
			reference_doctype: props.referenceDoctype,
			reference_name: props.referenceName,
			start: start.value,
			page_length: EVIDENCE_PAGE_LENGTH,
		})
		items.value = items.value.concat(result?.data || [])
		total.value = result?.total || 0
		start.value = items.value.length
	} finally {
		loading.value = false
		loadingMore.value = false
	}
}

function loadMore() {
	loadPage()
}

watch(
	() => props.isOpen,
	(open) => {
		if (open) loadPage({ reset: true })
	}
)

function openImage(row) {
	previewImage.value = row
}

function confirmDelete(row) {
	pendingDelete = row
	showDeleteDialog.value = true
}

async function handleDelete() {
	if (!pendingDelete) return
	deleting.value = true

	try {
		await deleteResource.submit({ doctype: "Work Evidence", name: pendingDelete.name })
		items.value = items.value.filter((row) => row.name !== pendingDelete.name)
		total.value = Math.max(0, total.value - 1)
		start.value = items.value.length
		toast({
			title: __("Success"),
			text: __("Evidence deleted"),
			icon: "check-circle",
			position: "bottom-center",
			iconClasses: "text-green-500",
		})
		emit("changed")
	} catch (error) {
		toast({
			title: __("Error"),
			text: error?.messages?.[0] || __("Could not delete evidence. Please try again."),
			icon: "alert-circle",
			position: "bottom-center",
			iconClasses: "text-red-500",
		})
	} finally {
		deleting.value = false
		showDeleteDialog.value = false
		pendingDelete = null
	}
}

function handleDismiss() {
	emit("did-dismiss")
}
</script>

<style scoped>
ion-modal {
	--height: 100%;
}
</style>
