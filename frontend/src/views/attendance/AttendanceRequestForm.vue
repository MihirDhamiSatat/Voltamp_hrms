<template>
	<ion-page>
		<ion-content :fullscreen="true">
			<FormView
				v-if="formFields.data"
				doctype="Attendance Request"
				:title="__('Backdated Timesheet')"
				v-model="attendanceRequest"
				:isSubmittable="true"
				:fields="formFields.data"
				:id="props.id"
				@validateForm="validateForm"
			>
				<template #timesheet_details_section-action>
					<Button variant="ghost" icon="filter" @click="isTaskFilterOpen = true" />
				</template>
			</FormView>

			<CustomIonModal :isOpen="isTaskFilterOpen" @did-dismiss="isTaskFilterOpen = false">
				<template #actionSheet>
					<div class="bg-white w-full flex flex-col items-center pb-5">
						<div class="w-full pt-8 pb-5 border-b text-center">
							<span class="text-gray-900 font-bold text-lg">{{ __("Filter Tasks") }}</span>
						</div>
						<div class="w-full flex flex-col gap-4 p-4">
							<FormField
								:label="__('From Date')"
								fieldtype="Date"
								v-model="taskDateFilter.from_date"
							/>
							<FormField
								:label="__('To Date')"
								fieldtype="Date"
								v-model="taskDateFilter.to_date"
							/>
							<div class="flex flex-row gap-3">
								<Button variant="outline" class="w-full py-5 text-sm" @click="clearTaskFilter">
									{{ __("Clear") }}
								</Button>
								<Button variant="solid" class="w-full py-5 text-sm" @click="isTaskFilterOpen = false">
									{{ __("Apply") }}
								</Button>
							</div>
						</div>
					</div>
				</template>
			</CustomIonModal>
		</ion-content>
	</ion-page>
</template>

<script setup>
import { IonPage, IonContent } from "@ionic/vue"
import { createResource } from "frappe-ui"
import { ref, computed, watch, inject } from "vue"

import FormView from "@/components/FormView.vue"
import FormField from "@/components/FormField.vue"
import CustomIonModal from "@/components/CustomIonModal.vue"

const employee = inject("$employee")
const __ = inject("$translate")

const props = defineProps({
	id: {
		type: String,
		required: false,
	},
})

// reactive object to store form data
const attendanceRequest = ref({})

const isTaskFilterOpen = ref(false)
const taskDateFilter = ref({ from_date: null, to_date: null })

// Overlap, not containment: a task matches if its own start/end span
// touches the filter window at all — its start is on/before the filter's
// end, and its end is on/after the filter's start.
const taskLinkFilters = computed(() => {
	const { from_date, to_date } = taskDateFilter.value
	const filters = {}
	if (to_date) filters.exp_start_date = ["<=", to_date]
	if (from_date) filters.exp_end_date = [">=", from_date]
	return filters
})

function clearTaskFilter() {
	taskDateFilter.value = { from_date: null, to_date: null }
}

watch(
	() => [taskLinkFilters.value, formFields.data],
	() => {
		const taskField = formFields.data?.find((field) => field.fieldname === "task")
		if (taskField) taskField.linkFilters = taskLinkFilters.value
	},
	{ deep: true }
)

// get form fields
const formFields = createResource({
	url: "hrms.api.get_doctype_fields",
	params: { doctype: "Attendance Request" },
	auto: true,
	transform(data) {
		if (props.id) return data
		return data.filter(
			(field) =>
				!["employee", "employee_name", "status", "company", "timesheet", "shift"].includes(
					field.fieldname
				)
		)
	},
})

// form scripts
watch(
	() => attendanceRequest.value.employee,
	(employee_id) => {
		if (props.id && employee_id !== employee.data.name) {
			// if employee is not the current user, set form as read only
			setFormReadOnly()
		}
	}
)

watch(
	() => attendanceRequest.value.from_date,
	(from_date) => {
		if (!attendanceRequest.value.to_date) {
			attendanceRequest.value.to_date = from_date
		}
	}
)

watch(
	() => [attendanceRequest.value.from_date, attendanceRequest.value.to_date],
	([from_date, to_date]) => {
		validateDates(from_date, to_date)
	}
)

watch(
	() => attendanceRequest.value.half_day,
	(half_day) => {
		const half_day_date = formFields.data.find((field) => field.fieldname === "half_day_date")
		half_day_date.hidden = !half_day
	}
)

// helper functions
function setFormReadOnly() {
	formFields.data.map((field) => (field.read_only = true))
}

function validateDates(from_date, to_date) {
	if (!(from_date && to_date)) return

	const error_message = from_date > to_date ? __("To Date cannot be before From Date") : ""

	const from_date_field = formFields.data.find((field) => field.fieldname === "from_date")
	from_date_field.error_message = error_message
}

function validateForm() {
	attendanceRequest.value.employee = employee.data.name
}
</script>
