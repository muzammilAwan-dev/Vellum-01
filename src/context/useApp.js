import { createContext, useContext } from "react";

// The app-wide context object and its hook live apart from <AppProvider> (AppContext.jsx)
// so that file only exports a component (keeps Fast Refresh working).
export const AppCtx = createContext(null);

export const useApp = () => {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp() must be used inside <AppProvider>");
  return ctx;
};
