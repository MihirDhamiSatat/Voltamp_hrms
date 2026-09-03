<template>
	<div class="flex flex-col w-full gap-2.5">
		<div class="flex flex-row items-start justify-between gap-3">
			<div class="flex flex-row items-start gap-3 grow">
				<TaskIcon class="h-5 w-5 text-gray-500 shrink-0 mt-0.5" />
				<div class="flex flex-col items-start gap-1.5">
					<div class="text-base font-normal text-gray-800">
						{{ props.doc.subject }}
					</div>
					<div class="text-xs font-normal text-gray-500">
						<span v-if="props.doc.project">{{ props.doc.project }}</span>
						<span v-if="props.doc.project && dueDate" class="whitespace-pre"> &middot; </span>
						<span v-if="dueDate">{{ __("Due {0}", [dueDate]) }}</span>
					</div>
				</div>
			</div>
			<div class="flex flex-col items-end gap-1.5 shrink-0">
				<Badge
					v-if="props.doc.priority"
					variant="subtle"
					:theme="priorityTheme"
					:label="__(props.doc.priority)"
					size="sm"
				/>
				<Badge variant="outline" :theme="statusTheme" :label="__(props.doc.status)" size="sm" />
			</div>
		</div>

		<div v-if="showProgress" class="flex flex-row items-center gap-2 pl-8">
			<div class="grow h-1.5 rounded-full bg-gray-100 overflow-hidden">
				<div class="h-full rounded-full bg-gray-800" :style="{ width: `${progressPercent}%` }" />
			</div>
			<div class="text-xs text-gray-500 shrink-0">{{ progressPercent }}%</div>
		</div>
	</div>
</template>

<script setup>
import { Badge } from "frappe-ui"
import { computed, inject } from "vue"

import TaskIcon from "@/components/icons/TaskIcon.vue"

const dayjs = inject("$dayjs")
const __ = inject("$translate")

const props = defineProps({
	doc: {
		type: Object,
		required: true,
	},
})

const STATUS_THEME = {
	Open: "gray",
	Working: "blue",
	"Pending Review": "orange",
	Overdue: "red",
	Completed: "green",
	Cancelled: "red",
	Template: "gray",
}

const PRIORITY_THEME = {
	Low: "gray",
	Medium: "blue",
	High: "orange",
	Urgent: "red",
}

const statusTheme = computed(() => STATUS_THEME[props.doc.status] || "gray")
const priorityTheme = computed(() => PRIORITY_THEME[props.doc.priority] || "gray")

const dueDate = computed(() => {
	return props.doc.exp_end_date ? dayjs(props.doc.exp_end_date).format("D MMM") : ""
})

const progressPercent = computed(() => Math.round(props.doc.progress || 0))
const showProgress = computed(() =>
	["Working", "Pending Review", "Overdue"].includes(props.doc.status)
)
</script>
