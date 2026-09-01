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
				@formReloaded="skipNextAddressGeocode = true"
			>
				<template #timesheet_details_section-action>
					<Button variant="ghost" icon="filter" @click="isTaskFilterOpen = true" />
				</template>

				<template #location_section-action>
					<Button
						variant="ghost"
						size="lg"
						:loading="isFetchingLocation"
						@click="fetchLiveLocation"
					>
						<template #icon>
							<img :src="locationIcon" class="h-7 w-7" alt="" />
						</template>
					</Button>
				</template>

				<template #location_address-after>
					<LocationMap
						:latitude="attendanceRequest.latitude"
						:longitude="attendanceRequest.longitude"
						:status="locationStatus"
					/>
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
import { createResource, debounce } from "frappe-ui"
import { ref, computed, watch, inject } from "vue"

import FormView from "@/components/FormView.vue"
import FormField from "@/components/FormField.vue"
import CustomIonModal from "@/components/CustomIonModal.vue"
import LocationMap from "@/components/LocationMap.vue"
import locationIcon from "@/assets/location.avif"

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
const locationStatus = ref("")

// Before save, the form has no employee picker (it's always the current
// user's own request), so fall back to the logged-in employee until the doc
// actually carries one (e.g. when viewing/editing an existing request).
const activityTypeEmployee = computed(() => attendanceRequest.value.employee || employee.data.name)

// Task must only list Tasks assigned (via "Assign To") to this employee - not
// every Task in the system - scoped server-side via `task_query`, which also
// applies the date range below (overlap, not containment: a task matches if
// its own start/end span touches the filter window at all — its start is
// on/before the filter's end, and its end is on/after the filter's start).
const taskQuery = "voltamp_fca.voltamp_fca.permissions.task_query"
const taskLinkFilters = computed(() => {
	const { from_date, to_date } = taskDateFilter.value
	const filters = { employee: activityTypeEmployee.value }
	if (to_date) filters.exp_start_date = ["<=", to_date]
	if (from_date) filters.exp_end_date = [">=", from_date]
	return filters
})

function clearTaskFilter() {
	taskDateFilter.value = { from_date: null, to_date: null }
}

// get form fields
// NOTE: must be declared before the watchers below - they read formFields.data
// (one of them with `immediate: true`, which runs synchronously during setup),
// so declaring this later would reference formFields before initialization.
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

watch(
	() => [taskLinkFilters.value, formFields.data],
	() => {
		const taskField = formFields.data?.find((field) => field.fieldname === "task")
		if (!taskField) return
		taskField.query = taskQuery
		taskField.linkFilters = taskLinkFilters.value
	},
	{ deep: true }
)

// Activity Type must only list the options in the current employee's
// Employee Skill Map "Work Profile" - scoped via the same whitelisted method
// the desk form uses.
watch(
	() => [activityTypeEmployee.value, formFields.data],
	() => {
		const activityTypeField = formFields.data?.find((field) => field.fieldname === "activity_type")
		if (!activityTypeField) return
		activityTypeField.query = "voltamp_fca.voltamp_fca.permissions.activity_type_query"
		activityTypeField.linkFilters = { employee: activityTypeEmployee.value }
	},
	{ immediate: true }
)

// Auto-fill Project from the selected Task's own project — if the task isn't
// linked to one, just leave Project as-is.
const taskProject = createResource({ url: "frappe.client.get_value" })

watch(
	() => attendanceRequest.value.task,
	(taskName) => {
		if (!taskName) return

		taskProject.submit(
			{ doctype: "Task", filters: { name: taskName }, fieldname: "project" },
			{
				onSuccess(data) {
					if (data?.project) attendanceRequest.value.project = data.project
				},
			}
		)
	}
)

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

// Location: address -> lat/lng (+ map preview), mirroring the desk form
// (voltamp_fca/public/js/location_geocode.js). `skipNextAddressGeocode`
// avoids re-geocoding on the initial doc load / a formReloaded (only actual
// user edits to the address should trigger a lookup).
let skipNextAddressGeocode = Boolean(props.id)
let geocodeToken = 0

const geocodeAddress = createResource({
	url: "voltamp_fca.voltamp_fca.geolocation.geocode_address",
})

function setLocationError(message) {
	const addressField = formFields.data?.find((field) => field.fieldname === "location_address")
	if (addressField) addressField.error_message = message || ""
}

const fetchLocation = debounce((address) => {
	const token = ++geocodeToken

	if (!address) {
		attendanceRequest.value.latitude = null
		attendanceRequest.value.longitude = null
		locationStatus.value = ""
		setLocationError("")
		return
	}

	locationStatus.value = __("Finding location…")
	setLocationError("")

	geocodeAddress.submit(
		{ address },
		{
			onSuccess(data) {
				if (token !== geocodeToken) return // stale response, address changed again
				attendanceRequest.value.latitude = data.latitude
				attendanceRequest.value.longitude = data.longitude
				locationStatus.value = ""
			},
			onError(error) {
				if (token !== geocodeToken) return
				locationStatus.value = ""
				setLocationError(error.messages?.[0] || __("Could not find that address."))
			},
		}
	)
}, 500)

watch(
	() => attendanceRequest.value.location_address,
	(address) => {
		if (skipNextAddressGeocode) {
			skipNextAddressGeocode = false
			return
		}
		fetchLocation((address || "").trim())
	}
)

// Location: live GPS -> address (the reverse of the above) - lets the
// employee stamp their *actual* current position instead of typing an
// address by hand, which is the whole point of this button as a safety
// check on backdated entries.
const isFetchingLocation = ref(false)

const reverseGeocode = createResource({
	url: "voltamp_fca.voltamp_fca.geolocation.reverse_geocode",
})

function fetchLiveLocation() {
	if (!navigator.geolocation) {
		setLocationError(__("Geolocation is not supported by your current browser"))
		return
	}

	isFetchingLocation.value = true
	locationStatus.value = __("Locating…")
	setLocationError("")

	navigator.geolocation.getCurrentPosition(
		(position) => {
			const { latitude, longitude } = position.coords
			geocodeToken++ // invalidate any in-flight address -> coords lookup

			reverseGeocode.submit(
				{ latitude, longitude },
				{
					onSuccess(data) {
						isFetchingLocation.value = false
						locationStatus.value = ""
						// this is the real GPS reading — don't let it re-trigger a
						// (less precise) address -> coords lookup on top of it
						skipNextAddressGeocode = true
						attendanceRequest.value.location_address = data.display_name
						attendanceRequest.value.latitude = data.latitude
						attendanceRequest.value.longitude = data.longitude
					},
					onError(error) {
						isFetchingLocation.value = false
						locationStatus.value = ""
						setLocationError(
							error.messages?.[0] || __("Could not look up an address for your location.")
						)
					},
				}
			)
		},
		(error) => {
			isFetchingLocation.value = false
			locationStatus.value = ""
			setLocationError(__("Unable to retrieve your location: {0}", [error.message]))
		}
	)
}

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
