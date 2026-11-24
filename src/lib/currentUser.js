// Stand-in for the logged-in student until real auth exists. Login is
// still a role picker, so the student experience always runs as this
// person; swap for the user from the auth token once the backend is in.
export const CURRENT_STUDENT = { name: "Maya Okafor", cls: "11A" };
