import type { RtflRuntime } from "./RtflRuntime";
import type { Scope } from "./Scope";
import type { RtflType } from "../types";

export interface RtflFunction {
  run(args: RtflType[], runtime: RtflRuntime, scope: Scope): RtflType;
}
