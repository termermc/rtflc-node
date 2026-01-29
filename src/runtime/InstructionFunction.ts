import type { RtflInstruction } from "../instructions";
import { IntType } from "../types";
import type { RtflType } from "../types";
import type { RtflRuntime } from "./RtflRuntime";
import type { Scope } from "./Scope";
import type { RtflFunction } from "./RtflFunction";

export class InstructionFunction implements RtflFunction {
  private readonly insts: RtflInstruction[];
  private readonly argNames: string[];

  constructor(instructions: RtflInstruction[], argumentNames: string[] = []) {
    this.insts = instructions;
    this.argNames = argumentNames;
  }

  run(args: RtflType[], rt: RtflRuntime, scope: Scope): RtflType {
    for (let i = 0; i < args.length; i += 1) {
      if (i < this.argNames.length) {
        scope.createLocalVar(this.argNames[i], args[i]);
      }
      scope.createLocalVar(`arg${i + 1}`, args[i]);
    }
    scope.createLocalVar("arglen", new IntType(args.length));

    const val = rt.execute(this.insts, scope);

    for (let i = 0; i < args.length; i += 1) {
      if (i < this.argNames.length && scope.variableAliases().has(this.argNames[i])) {
        scope.undefineVar(this.argNames[i]);
      }
      const vname = `arg${i + 1}`;
      if (scope.variableAliases().has(vname)) {
        scope.undefineVar(vname);
      }
    }
    if (scope.variableAliases().has("arglen")) {
      scope.undefineVar("arglen");
    }

    return val;
  }
}
