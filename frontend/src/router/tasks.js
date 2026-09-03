const routes = [
	{
		name: "TaskListView",
		path: "/tasks",
		component: () => import("@/views/tasks/TaskList.vue"),
	},
]

export default routes
