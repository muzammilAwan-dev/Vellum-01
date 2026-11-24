import { call } from "@/api/client";
import { useResource } from "./useResource";

/** The signed-in user's own profile → { data }. Real endpoint: GET /api/profile. */
export const useProfile = () => useResource(["profile"], { fetch: () => call("/profile") });
