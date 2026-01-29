import type { RtflRuntime } from "./runtime/RtflRuntime";

export interface RtflLibrary {
  initialize(runtime: RtflRuntime): void;
}
