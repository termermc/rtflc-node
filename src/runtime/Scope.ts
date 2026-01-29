import type { RtflInstruction } from "../instructions";
import { RuntimeException } from "./RuntimeException";
import type { RtflFunction } from "./RtflFunction";
import type { RtflRuntime } from "./RtflRuntime";
import type { RtflType } from "../types";

export class Scope {
  private readonly rt: RtflRuntime;
  private readonly locals: Map<string, number>;
  private readonly parentScope?: Scope;
  private readonly causeInstruction?: RtflInstruction | null;
  private readonly restrictedFuncs: string[];

  constructor(
    runtime: RtflRuntime,
    localAliases?: Map<string, number> | null,
    causeInstruction?: RtflInstruction | null,
    parentScope?: Scope | null,
    restrictedFunctions?: string[]
  ) {
    this.rt = runtime;
    this.locals = localAliases ? new Map(localAliases) : new Map();
    this.parentScope = parentScope ?? undefined;
    this.causeInstruction = causeInstruction ?? null;
    this.restrictedFuncs = restrictedFunctions ?? [];
  }

  parent(): Scope | undefined {
    return this.parentScope;
  }

  runtime(): RtflRuntime {
    return this.rt;
  }

  cause(): RtflInstruction | null {
    return this.causeInstruction ?? null;
  }

  variableAliases(): Map<string, number> {
    return this.locals;
  }

  assignVar(varName: string, value: RtflType): boolean {
    if (this.locals.has(varName)) {
      const id = this.locals.get(varName);
      if (id !== undefined) {
        const localVar = this.rt.localVariables().get(id);
        if (!localVar) {
          this.locals.delete(varName);
          throw new RuntimeException(`Attempted to assign value to undefined variable "${varName}"`);
        }
        this.rt.localVariables().set(id, this.rt.createLocalVar(value));
        return true;
      }
    }

    if (this.rt.globalVariables().has(varName)) {
      this.rt.globalVariables().set(varName, value);
      return false;
    }

    throw new RuntimeException(`Attempted to assign value to undefined variable "${varName}"`);
  }

  createLocalVar(varName: string, value: RtflType): number {
    const id = this.rt.newId();
    if (this.locals.has(varName)) {
      this.locals.delete(varName);
    }
    this.rt.localVariables().set(id, this.rt.createLocalVar(value));
    this.locals.set(varName, id);
    return id;
  }

  undefineVar(varName: string): number {
    if (this.locals.has(varName)) {
      const id = this.locals.get(varName);
      if (id !== undefined) {
        this.locals.delete(varName);
        this.rt.localVariables().delete(id);
        return id;
      }
    }

    if (this.rt.globalVariables().has(varName)) {
      this.rt.globalVariables().delete(varName);
      return -1;
    }

    throw new RuntimeException(`Attempted undefine undefined variable "${varName}"`);
  }

  undefineFunc(funcName: string): void {
    if (!this.restrictedFuncs.includes(funcName) && this.rt.functions().has(funcName)) {
      this.rt.functions().delete(funcName);
    }
  }

  restrictFunc(funcName: string): void {
    this.restrictedFuncs.push(funcName);
  }

  varValue(varName: string): RtflType {
    if (this.locals.has(varName)) {
      const id = this.locals.get(varName);
      if (id !== undefined) {
        const localVar = this.rt.localVariables().get(id);
        if (!localVar) {
          this.locals.delete(varName);
          throw new RuntimeException(`Attempted to retrieve value from undefined variable "${varName}"`);
        }
        return localVar.value;
      }
    }

    if (this.rt.globalVariables().has(varName)) {
      return this.rt.globalVariables().get(varName)!;
    }

    throw new RuntimeException(`Attempted to retrieve value from undefined variable "${varName}"`);
  }

  function(funcName: string): RtflFunction {
    if (this.restrictedFuncs.includes(funcName) || !this.rt.functions().has(funcName)) {
      throw new RuntimeException(`Attempted to call undefined or restricted function "${funcName}"`);
    }
    return this.rt.functions().get(funcName)!;
  }

  scopeStack(): Scope[] {
    const tmp: Scope[] = [this];
    let current: Scope | undefined = this;
    while (current?.parent()) {
      current = current.parent();
      if (current) {
        tmp.push(current);
      }
    }
    return tmp.reverse();
  }

  descend(causeInstruction?: RtflInstruction | null): Scope {
    return new Scope(this.rt, new Map(this.locals), causeInstruction ?? null, this, this.restrictedFuncs);
  }
}
