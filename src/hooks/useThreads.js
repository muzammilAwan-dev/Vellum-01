import { call } from "@/api/client";
import { useResource } from "./useResource";

/**
 * The class's discussion threads (GET /api/threads). A teacher passes the class
 * they are looking at; a student's class is implied. Polled so new replies
 * show up without a reload.
 */
export const useThreads = ({ classId, enabled = true } = {}) =>
  useResource(["threads", classId ?? "mine"], {
    fetch: () => call(classId ? `/threads?classId=${encodeURIComponent(classId)}` : "/threads"),
    enabled,
    refetchInterval: 30_000,
  });
