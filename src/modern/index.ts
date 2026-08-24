/**
 * Modern sparse SNA facade.
 *
 * This entry intentionally remains separate from the legacy root export so
 * applications that only use the R sna-compatible API do not pay for the
 * modern algorithm families.
 */
export * from "./types";
export * from "../graph/index";
export * from "../centrality/index";
export * from "../statistics/index";
export * from "../community/index";
export * from "../prediction/index";
