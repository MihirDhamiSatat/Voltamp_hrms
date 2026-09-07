<template>
	<div class="flex flex-col bg-white rounded w-full py-6 px-4 border-none">
		<div class="flex flex-row items-center justify-between">
			<h2 class="text-lg font-bold text-gray-900">
				{{ __("Hey, {0} 👋", [employee?.data?.first_name]) }}
			</h2>
			<Button
				v-if="settings.data?.allow_employee_checkin_from_mobile_app"
				variant="ghost"
				icon="filter"
				@click="isTaskFilterOpen = true"
			/>
		</div>

		<template v-if="settings.data?.allow_employee_checkin_from_mobile_app">
			<div class="font-medium text-sm text-gray-500 mt-1.5" v-if="lastLog">
				<span>{{ __("Last {0} was at {1}", [__(lastLogType), formatTimestamp(lastLog.time)]) }}</span>
				<span class="whitespace-pre"> &middot; </span>
				<router-link :to="{ name: 'EmployeeCheckinListView' }" v-slot="{ navigate }">
					<span @click="navigate" class="underline">View List</span>
				</router-link>
			</div>

			<div class="w-full flex flex-col gap-3 mt-3">
				<FormField
					v-for="field in timesheetFields.data"
					:key="field.fieldname"
					class="w-full"
					:label="__(field.label, null, 'Employee Checkin')"
					:fieldtype="field.fieldtype"
					:fieldname="field.fieldname"
					:options="field.options"
					:reqd="field.reqd"
					:readOnly="isFieldLocked(field.fieldname)"
					:linkFilters="linkFiltersFor(field.fieldname)"
					:query="queryFor(field.fieldname)"
					:modelValue="isFieldLocked(field.fieldname) ? lastLog[field.fieldname] : timesheetDetail[field.fieldname]"
					@update:modelValue="(v) => (timesheetDetail[field.fieldname] = v)"
				/>
			</div>

			<Button
				v-if="pendingTimesheet"
				class="mt-4 mb-1 drop-shadow-sm py-5 text-base disabled:bg-gray-700"
				:loading="submitTimesheetAction.loading || timesheetDoc.loading || saveTimesheetDoc.loading"
				:disabled="timesheetDetailLoading"
				@click="handleSubmitTimesheet"
			>
				<template #prefix>
					<FeatherIcon name="check-circle" class="w-4" />
				</template>
				{{ __("Submit Timesheet") }}
			</Button>

			<Button
				v-else
				class="mt-4 mb-1 drop-shadow-sm py-5 text-base disabled:bg-gray-700"
				:loading="checkins.list.loading || timesheetDetailLoading"
				:disabled="checkinDetailMissing"
				@click="handleEmployeeCheckin"
			>
				<template #prefix>
					<FeatherIcon
						:name="nextAction.action === 'IN' ? 'arrow-right-circle' : 'arrow-left-circle'"
						class="w-4"
					/>
				</template>
				{{ nextAction.label }}
			</Button>
		</template>

		<div v-else class="font-medium text-sm text-gray-500 mt-1.5">
			{{ dayjs().format("ddd, D MMMM, YYYY") }}
		</div>
	</div>

	<CustomIonModal
		v-if="settings.data?.allow_employee_checkin_from_mobile_app"
		:isOpen="isModalOpen"
		@did-dismiss="isModalOpen = false"
	>
		<template #actionSheet>
			<div class="h-full w-full flex flex-col items-center justify-center gap-5 p-4 mb-5 bg-white">
				<div class="flex flex-col gap-1.5 mt-2 items-center justify-center">
					<div class="font-bold text-xl">
						{{ dayjs(checkinTimestamp).format("hh:mm:ss a") }}
					</div>
					<div class="font-medium text-gray-500 text-sm">
						{{ dayjs().format("D MMM, YYYY") }}
					</div>
				</div>

				<template v-if="settings.data?.allow_geolocation_tracking">
					<span v-if="locationStatus" class="font-medium text-gray-500 text-sm">
						{{ locationStatus }}
					</span>

					<div class="rounded border-4 translate-z-0 block overflow-hidden w-full h-170">
						<iframe
							width="100%"
							height="170"
							frameborder="0"
							scrolling="no"
							marginheight="0"
							marginwidth="0"
							style="border: 0"
							:src="`https://maps.google.com/maps?q=${latitude},${longitude}&hl=en&z=15&amp;output=embed`"
						>
						</iframe>
					</div>
				</template>

				<Button
					:loading="checkins.insert.loading || timesheetDetailLoading"
					variant="solid"
					class="w-full py-5 text-sm disabled:bg-gray-700"
					:disabled="checkinDetailMissing"
					@click="submitLog(nextAction.action)"
				>
					{{ __("Confirm {0}", [nextAction.label]) }}
				</Button>
			</div>
		</template>
	</CustomIonModal>

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
</template>

<script setup>
import { createListResource, createResource, toast, FeatherIcon } from "frappe-ui"
import { computed, inject, ref, watch, onMounted, onBeforeUnmount } from "vue"

import FormField from "@/components/FormField.vue"
import CustomIonModal from "@/components/CustomIonModal.vue"
import { formatTimestamp } from "@/utils/formatters"
import { settings } from "@/data/settings"

const DOCTYPE = "Employee Checkin"

const socket = inject("$socket")
const employee = inject("$employee")
const dayjs = inject("$dayjs")
const __ = inject("$translate")
const checkinTimestamp = ref(null)
const latitude = ref(0)
const longitude = ref(0)
const locationStatus = ref("")
const isModalOpen = ref(false)
const timesheetDetail = ref({})
const pendingTimesheet = ref(null)
const timesheetDetailLoading = ref(false)
const isTaskFilterOpen = ref(false)
const taskDateFilter = ref({ from_date: null, to_date: null })

// Filters the Task Link field's own options by when the task was created,
// so a long task list can be narrowed down to recently made tasks.
// Overlap, not containment: a task matches if its own start/end span
// touches the filter window at all — its start is on/before the filter's
// end, and its end is on/after the filter's start.
// Task must only list Tasks assigned (via "Assign To") to the current
// employee - not every Task in the system. Scoped server-side via `taskQuery`
// (voltamp_fca.voltamp_fca.permission.task.task_query), which also applies the
// date range below.
const taskQuery = "voltamp_fca.voltamp_fca.permission.task.task_query"
const taskLinkFilters = computed(() => {
	const { from_date, to_date } = taskDateFilter.value
	const filters = { employee: employee.data.name }
	if (to_date) filters.exp_start_date = ["<=", to_date]
	if (from_date) filters.exp_end_date = [">=", from_date]
	return filters
})

function clearTaskFilter() {
	taskDateFilter.value = { from_date: null, to_date: null }
}

// Activity Type must only list the options in the current employee's
// Employee Skill Map "Work Profile" (see voltamp_fca's employee_checkin.js
// on desk). Recomputed off the injected employee so it refetches if that
// context ever changes.
const activityTypeQuery = "voltamp_fca.voltamp_fca.permission.activity_type.activity_type_query"
const activityTypeFilters = computed(() => ({ employee: employee.data.name }))

function linkFiltersFor(fieldname) {
	if (fieldname === "task") return taskLinkFilters.value
	if (fieldname === "activity_type") return activityTypeFilters.value
	return undefined
}

// If the employee's Skill Map "Work Profile" only grants a single Activity
// Type, there's nothing to actually pick from — preselect it instead of
// making them open a dropdown with one option in it.
const activityTypeOptions = createResource({
	url: activityTypeQuery,
	params: {
		doctype: "Activity Type",
		txt: "",
		searchfield: "name",
		start: 0,
		page_len: 2,
		filters: activityTypeFilters.value,
	},
	auto: true,
	onSuccess: applyDefaultActivityType,
})

function applyDefaultActivityType() {
	const options = activityTypeOptions.data
	if (options?.length === 1 && !timesheetDetail.value.activity_type) {
		timesheetDetail.value = { ...timesheetDetail.value, activity_type: options[0][0] }
	}
}

function queryFor(fieldname) {
	if (fieldname === "task") return taskQuery
	if (fieldname === "activity_type") return activityTypeQuery
	return undefined
}

const taskProject = createResource({ url: "voltamp_fca.voltamp_fca.permission.task.get_task_project" })

// Auto-fill Project from the selected Task's own project — if the task
// isn't linked to one, just leave Project as-is.
//
// Deliberately not a plain frappe.client.get_value call: Task's role
// permissions don't grant Employee-role users blanket read access (see
// task_query_conditions in voltamp_fca), so that would silently fail for
// any Task without an incidental DocShare. get_task_project mirrors
// task_query's own _assign-based scoping instead, so it works for every
// Task actually assigned to the employee.
watch(
	() => timesheetDetail.value.task,
	(taskName) => {
		if (isFieldLocked("task") || !taskName) return

		taskProject.submit(
			{ task: taskName, employee: employee.data.name },
			{
				onSuccess(project) {
					if (project) {
						timesheetDetail.value = { ...timesheetDetail.value, project }
					}
				},
			}
		)
	}
)

const checkins = createListResource({
	doctype: DOCTYPE,
	fields: [
		"name",
		"employee",
		"employee_name",
		"log_type",
		"time",
		"device_id",
		"timesheet",
		"timesheet_detail",
		"activity_type",
		"project",
		"task",
	],
	filters: {
		employee: employee.data.name,
	},
	orderBy: "time desc",
})
checkins.reload()

const lastLog = computed(() => {
	if (checkins.list.loading || !checkins.data) return {}
	return checkins.data[0]
})

const lastLogType = computed(() => {
	return lastLog?.value?.log_type === "IN" ? "check-in" : "check-out"
})

const nextAction = computed(() => {
	return lastLog?.value?.log_type === "IN"
		? { action: "OUT", label: __("Check Out") }
		: { action: "IN", label: __("Check In") }
})

// Once checked in (or checked out but not yet submitted), Activity Type/
// Project/Task are locked to what was entered at check-in — only
// Description stays editable for the checkout note.
const isCycleActive = computed(() => lastLog.value?.log_type === "IN" || !!pendingTimesheet.value)

function isFieldLocked(fieldname) {
	return fieldname !== "description" && isCycleActive.value
}

// Activity Type/Project/Task/Description must all be filled before a fresh Check In.
const checkinDetailMissing = computed(() => {
	if (nextAction.value.action !== "IN") return false
	return ["activity_type", "project", "task", "description"].some(
		(fieldname) => !timesheetDetail.value[fieldname]
	)
})

// Timesheet Details fields live directly on Employee Checkin (added by the
// voltamp_fca custom app); fetched via doctype meta so labels/options stay
// in sync with whatever that app defines. Shown inline on the panel, above
// the Check In/Check Out button.
const timesheetFields = createResource({
	url: "hrms.api.get_doctype_fields",
	params: { doctype: "Employee Checkin" },
	transform(data) {
		const order = ["task", "project", "activity_type", "description"]
		const requiredAtCheckin = ["activity_type", "project", "task", "description"]
		return order
			.map((name) => data.find((field) => field.fieldname === name))
			.filter(Boolean)
			.map((field) => (requiredAtCheckin.includes(field.fieldname) ? { ...field, reqd: 1 } : field))
	},
})
timesheetFields.reload()

const timesheetDocstatus = createResource({ url: "frappe.client.get_value" })
const submitTimesheetAction = createResource({
	url: "voltamp_fca.voltamp_fca.employee_checkin_timesheet.submit_linked_timesheet",
})
const timesheetDoc = createResource({ url: "frappe.client.get" })
const saveTimesheetDoc = createResource({ url: "frappe.client.save" })

function findTimesheetRow(doc, rowName) {
	if (!doc?.time_logs?.length) return null
	return doc.time_logs.find((row) => row.name === rowName) || doc.time_logs[doc.time_logs.length - 1]
}

// Persists the full (edited) description onto the Timesheet row directly —
// a straight replace, not an append — since child table rows can only be
// saved through their parent document.
function saveTimesheetDescription(timesheetName, description, rowName, onDone) {
	timesheetDoc.submit(
		{ doctype: "Timesheet", name: timesheetName },
		{
			onSuccess(doc) {
				const row = findTimesheetRow(doc, rowName)
				if (row) row.description = description || ""

				saveTimesheetDoc.submit(
					{ doc },
					{
						onSuccess: onDone,
						onError(error) {
							showErrorToasts(error, __("Saving description"))
							onDone()
						},
					}
				)
			},
			onError(error) {
				showErrorToasts(error, __("Saving description"))
				onDone()
			},
		}
	)
}

// Whenever the last log changes (a new checkin/checkout just landed),
// auto-fill Description with whatever is already saved on the Timesheet row
// so far, so it can be freely added to or edited — it never resets to blank
// while a cycle is active. Only a genuinely fresh cycle (no linked
// timesheet yet) starts blank.
//
// checkins.list.loading is checked and skipped here on purpose: the moment
// any reload of the checkin list starts (including the automatic one
// frappe-ui fires right after an insert succeeds), lastLog briefly reports
// nothing at all while the fetch is in flight. Reacting to that transient
// "nothing" as if it were a genuine fresh cycle wiped real descriptions —
// so only ever act once loading has actually settled.
watch(
	() => [checkins.list.loading, lastLog.value?.name],
	([loading]) => {
		if (loading) return

		const timesheetName = lastLog.value?.timesheet

		if (!timesheetName) {
			timesheetDetail.value = {}
			applyDefaultActivityType()
			timesheetDetailLoading.value = false
			return
		}

		// Block Check In/Check Out (see the disabled/loading bindings on those
		// buttons) until this resolves — submitting before it lands would save
		// a blank description over the real one (a real bug we hit once).
		timesheetDetailLoading.value = true

		timesheetDoc.submit(
			{ doctype: "Timesheet", name: timesheetName },
			{
				onSuccess(doc) {
					timesheetDetailLoading.value = false

					// Once this Timesheet is submitted, the cycle it belongs to is
					// done — checked via this same fetch's docstatus (not a
					// separately-timed check) so there's no race between two
					// independent async lookups deciding this differently.
					if (doc.docstatus !== 0) {
						timesheetDetail.value = { ...timesheetDetail.value, description: "" }
						return
					}

					const row = findTimesheetRow(doc, lastLog.value?.timesheet_detail)
					timesheetDetail.value = { ...timesheetDetail.value, description: row?.description || "" }
				},
				onError() {
					timesheetDetailLoading.value = false
				},
			}
		)
	},
	{ immediate: true }
)

// Recompute whether the last OUT's Timesheet is still awaiting the "Submit
// Timesheet" click, so that button's state survives a page reload, not just
// this session.
//
// docstatus alone can't tell this apart: voltamp_fca's Timesheet Approval
// workflow only reaches docstatus 1 at "Approved" - clicking Submit
// Timesheet just moves Draft -> Pending Approval, which is still docstatus
// 0. Checking docstatus alone would keep re-offering "Submit Timesheet"
// forever after it was already clicked, blocking the next Check In. So this
// also needs workflow_state, to distinguish "still Draft" from "already
// submitted, awaiting a Project Manager's approval".
watch(
	() => [lastLog.value?.log_type, lastLog.value?.timesheet],
	([logType, timesheetName]) => {
		if (logType !== "OUT" || !timesheetName) {
			pendingTimesheet.value = null
			return
		}

		timesheetDocstatus.submit(
			{ doctype: "Timesheet", filters: { name: timesheetName }, fieldname: ["docstatus", "workflow_state"] },
			{
				onSuccess(data) {
					const stillDraft = data?.docstatus === 0 && data?.workflow_state !== "Pending Approval"
					pendingTimesheet.value = stillDraft ? timesheetName : null
				},
				onError() {
					pendingTimesheet.value = null
				},
			}
		)
	},
	{ immediate: true }
)

function handleLocationSuccess(position) {
	latitude.value = position.coords.latitude
	longitude.value = position.coords.longitude

	locationStatus.value = [
		__("Latitude: {0}°", [Number(latitude.value).toFixed(5)]),
		__("Longitude: {0}°", [Number(longitude.value).toFixed(5)]),
	].join(", ")
}

function handleLocationError(error) {
	locationStatus.value = "Unable to retrieve your location"
	if (error) locationStatus.value += `: ERROR(${error.code}): ${error.message}`
}

const fetchLocation = () => {
	if (!navigator.geolocation) {
		locationStatus.value = __("Geolocation is not supported by your current browser")
	} else {
		locationStatus.value = __("Locating...")
		navigator.geolocation.getCurrentPosition(handleLocationSuccess, handleLocationError)
	}
}

const handleEmployeeCheckin = () => {
	checkinTimestamp.value = dayjs().format("YYYY-MM-DD HH:mm:ss")

	if (settings.data?.allow_geolocation_tracking) {
		fetchLocation()
	}

	isModalOpen.value = true
}

function showErrorToasts(error, actionLabel) {
	let messages = error.messages || []

	for (const message of messages) {
		toast({
			title: __("Error"),
			text: message || __("{0} failed!", [actionLabel]),
			icon: "alert-circle",
			position: "bottom-center",
			iconClasses: "text-red-500",
		})
	}
}

const submitLog = (logType) => {
	const actionLabel = logType === "IN" ? __("Check-in") : __("Check-out")

	// Snapshot now, before the insert call triggers any reactive side effects
	// (including frappe-ui's own automatic list reload) that could otherwise
	// touch timesheetDetail before we get to use this value below.
	const descriptionAtSubmitTime = timesheetDetail.value.description

	// At OUT, description is intentionally left out of the insert payload —
	// voltamp_fca's after_insert hook would otherwise append it to the
	// existing row text. We save the edited full text ourselves below instead
	// (a straight replace, so add/remove edits are kept exactly as typed).
	const timesheetFieldValues =
		logType === "IN"
			? timesheetDetail.value
			: {
					activity_type: lastLog.value?.activity_type,
					project: lastLog.value?.project,
					task: lastLog.value?.task,
				}

	checkins.insert.submit(
		{
			employee: employee.data.name,
			log_type: logType,
			time: checkinTimestamp.value,
			latitude: latitude.value,
			longitude: longitude.value,
			...timesheetFieldValues,
		},
		{
			onSuccess(doc) {
				isModalOpen.value = false

				const finish = () => {
					checkins.reload()
					toast({
						title: __("Success"),
						text: __("{0} successful!", [actionLabel]),
						icon: "check-circle",
						position: "bottom-center",
						iconClasses: "text-green-500",
					})
				}

				if (logType === "OUT" && doc.timesheet) {
					saveTimesheetDescription(doc.timesheet, descriptionAtSubmitTime, doc.timesheet_detail, finish)
				} else {
					finish()
				}
			},
			onError(error) {
				showErrorToasts(error, actionLabel)
			},
		}
	)
}

function submitTimesheet() {
	submitTimesheetAction.submit(
		{ employee_checkin: lastLog.value.name },
		{
			onSuccess() {
				pendingTimesheet.value = null
				timesheetDetail.value = {}
				applyDefaultActivityType()
				checkins.reload()
				toast({
					title: __("Success"),
					text: __("Timesheet submitted successfully!"),
					icon: "check-circle",
					position: "bottom-center",
					iconClasses: "text-green-500",
				})
			},
			onError(error) {
				showErrorToasts(error, __("Timesheet submission"))
			},
		}
	)
}

function handleSubmitTimesheet() {
	if (!pendingTimesheet.value) {
		submitTimesheet()
		return
	}

	// Save whatever is currently in the field (already auto-filled with the
	// existing text, plus any edits) as the final description, then submit.
	saveTimesheetDescription(
		pendingTimesheet.value,
		timesheetDetail.value.description,
		lastLog.value?.timesheet_detail,
		submitTimesheet
	)
}

onMounted(() => {
	socket.emit("doctype_subscribe", DOCTYPE)
	socket.on("list_update", (data) => {
		if (data.doctype == DOCTYPE) {
			checkins.reload()
		}
	})
})

onBeforeUnmount(() => {
	socket.emit("doctype_unsubscribe", DOCTYPE)
	socket.off("list_update")
})
</script>
