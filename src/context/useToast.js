import { createContext, useContext } from "react";

// Context object + hook, apart from <ToastProvider> (ToastContext.jsx) so that file only exports a component.
export const ToastCtx = createContext(null);

export const useToast = () => {
  const ctx = useContext(ToastCtx);
  if (!ctx) return { push: () => {}, dismiss: () => {}, toasts: [] };
  return ctx;
};
