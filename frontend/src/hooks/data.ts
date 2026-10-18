import { getActiveEvents, getConfig } from "../lib/client";
import { usePolled } from "./usePolled";

export const useProtocolConfig = () => usePolled(() => getConfig(), [], 30_000);

/** First page of open events. Pages with the Events tab handle "load more" themselves. */
export const useOpenEvents = () => usePolled(() => getActiveEvents(0, 12), [], 45_000);
