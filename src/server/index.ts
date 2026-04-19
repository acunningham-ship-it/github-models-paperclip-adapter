/**
 * Server-side barrel for the GitHub Models adapter.
 *
 * v0.5.0: no session persistence — each run is stateless.
 * v0.8.0 will add conversation history replay for session resume.
 */

export { execute } from "./execute.js";
export { testEnvironment } from "./test.js";
export { detectModel } from "./detect-model.js";
