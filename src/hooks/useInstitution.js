import { call } from "@/api/client";
import { useResource } from "./useResource";

/** The institution settings (name, contacts, logo, photo policy) → { data }. Real endpoint: GET /api/institution. */
export const useInstitution = () => useResource(["institution"], { fetch: () => call("/institution") });

/** Name and logo only, readable before sign-in → { data: { name, shortName, logo } }. Real endpoint: GET /api/institution/public. */
export const useBranding = () => useResource(["branding"], { fetch: () => call("/institution/public") });

/** The privacy policy, readable before sign-in (an admin also gets `source`) → { data }. Real endpoint: GET /api/institution/privacy. */
export const usePrivacy = () => useResource(["privacy"], { fetch: () => call("/institution/privacy") });
