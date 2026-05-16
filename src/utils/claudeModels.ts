/**
 * Shared Claude model identifiers.
 *
 * Single source of truth for the model id strings every Claude entry
 * point sends. Callers still pass these through `effectiveModel()` from
 * `claudeBudget.ts`, which downgrades to Haiku under the budget fallback
 * threshold — this module only fixes the *requested* model so a model
 * bump happens in one place instead of being scattered across files.
 */

/** Default Sonnet model id used by every non-Haiku Claude call. */
export const SONNET_MODEL = "claude-sonnet-4-6";
