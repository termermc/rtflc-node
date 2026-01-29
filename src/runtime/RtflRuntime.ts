import fs from "fs";
import path from "path";
import {
  ArrayAssignInstruction,
  AscendScopeInstruction,
  AsyncInstruction,
  DescendScopeInstruction,
  EndClauseInstruction,
  FuncCallInstruction,
  FuncDefInstruction,
  FuncUndefInstruction,
  IfInstruction,
  MapAssignInstruction,
  ReturnInstruction,
  RtflInstruction,
  TryInstruction,
  VarAssignInstruction,
  VarDefInstruction,
  VarLocalDefInstruction,
  VarUndefInstruction,
  WhileInstruction,
} from "../instructions";
import { BytecodeInstructionProducer } from "../producers/BytecodeInstructionProducer";
import { SourcecodeInstructionProducer } from "../producers/SourcecodeInstructionProducer";
import {
  ArrayType,
  MapType,
  NullType,
  NumberType,
  RtflType,
  StringType,
} from "../types";
import { AssignmentType } from "../types";
import { InstructionFunction } from "./InstructionFunction";
import type { RtflFunction } from "./RtflFunction";
import { RuntimeException } from "./RuntimeException";
import { Scope } from "./Scope";
import { StandardFunctions } from "./StandardFunctions";
import { JavaInteropFunctions } from "./JavaInteropFunctions";
import { ByteReader } from "../utils/ByteIO";

export class RtflRuntime {
  private readonly functionsMap = new Map<string, RtflFunction>();
  private readonly globalsMap = new Map<string, RtflType>();
  private readonly localsMap = new Map<number, LocalVar>();
  private readonly gc: GarbageCollector;
  private terminalOpenState = false;
  private terminalBuffer = "";
  private nextVarIdValue = 0;
  private readonly topScope: Scope;
  private readonly outputHandler: (text: string) => void;
  private threadNameValue = "main";

  constructor(options?: { output?: (text: string) => void }) {
    this.outputHandler = options?.output ?? ((text: string) => process.stdout.write(text));
    this.topScope = new Scope(this, new Map(), null);
    this.gc = new GarbageCollector(20 * 1000, this);
  }

  static isCompiledScript(buffer: Buffer): boolean {
    if (buffer.length < 4) {
      return false;
    }
    return buffer.subarray(0, 4).equals(Buffer.from([1, 3, 3, 7]));
  }

  static readCompiledMetadata(buffer: Buffer): RtflMetadata {
    const reader = new ByteReader(buffer, 4);
    const compVer = reader.readByte();
    const rtflVer = reader.readByte();
    const nameLen = reader.readByte();
    const filename = reader.readBytes(nameLen).toString("utf8");
    const hasLineNumbers = reader.readByte() > 0;
    return {
      fileName: filename,
      compilerVersion: compVer,
      rtflVersion: rtflVer,
      hasLineNumbers,
      offset: reader.position(),
    };
  }

  output(text: string): void {
    this.outputHandler(text);
  }

  openTerminal(): this {
    this.terminalOpenState = true;
    return this;
  }

  closeTerminal(): this {
    this.terminalOpenState = false;
    return this;
  }

  terminalOpen(): boolean {
    return this.terminalOpenState;
  }

  readTerminal(): string {
    if (!this.terminalOpenState) {
      throw new RuntimeException("Terminal is not open");
    }

    while (true) {
      const newlineIndex = this.terminalBuffer.indexOf("\n");
      if (newlineIndex >= 0) {
        const line = this.terminalBuffer.slice(0, newlineIndex).replace(/\r$/, "");
        this.terminalBuffer = this.terminalBuffer.slice(newlineIndex + 1);
        return line;
      }

      const buffer = Buffer.alloc(256);
      const bytesRead = fs.readSync(0, buffer, 0, buffer.length, null);
      if (bytesRead === 0) {
        const line = this.terminalBuffer;
        this.terminalBuffer = "";
        return line;
      }

      this.terminalBuffer += buffer.toString("utf8", 0, bytesRead);
    }
  }

  execute(instructions: RtflInstruction[], scope?: Scope, disownAll = false): RtflType {
    const execScope = scope ?? this.topScope;
    let currentScope = execScope;
    let val: RtflType = new NullType();
    const localIds: number[] = [];

    for (let i = 0; i < instructions.length; i += 1) {
      const inst = instructions[i];

      try {
        if (inst instanceof VarDefInstruction) {
          this.globalsMap.set(inst.variableName(), this.resolveValue(inst.variableValue(), currentScope));
        } else if (inst instanceof VarLocalDefInstruction) {
          const id = currentScope.createLocalVar(inst.variableName(), this.resolveValue(inst.variableValue(), currentScope));
          localIds.push(id);
        } else if (inst instanceof VarAssignInstruction) {
          currentScope.assignVar(inst.variableName(), this.resolveValue(inst.assignValue(), currentScope));
        } else if (inst instanceof ArrayAssignInstruction) {
          const array = this.resolveValue(inst.array(), currentScope);
          const index = this.resolveValue(inst.index(), currentScope);
          const value = this.resolveValue(inst.assignValue(), currentScope);

          if (!(array instanceof ArrayType)) {
            throw new RuntimeException("Cannot get element from non-array", inst);
          }
          if (!(index instanceof NumberType)) {
            throw new RuntimeException("Provided non-number index", inst);
          }

          array.items()[index.toInt()] = value;
        } else if (inst instanceof MapAssignInstruction) {
          const map = this.resolveValue(inst.map(), currentScope);
          const field = inst.field();
          const value = this.resolveValue(inst.assignValue(), currentScope);

          if (!(map instanceof MapType)) {
            throw new RuntimeException("Cannot get field from non-map", inst);
          }

          map.entries().set(field, value);
        } else if (inst instanceof VarUndefInstruction) {
          const undefId = currentScope.undefineVar(inst.variableName());
          if (undefId > -1) {
            const index = localIds.indexOf(undefId);
            if (index >= 0) {
              localIds.splice(index, 1);
            }
          }
        } else if (inst instanceof FuncCallInstruction) {
          currentScope
            .function(inst.functionName())
            .run(this.resolveValues(inst.functionArguments(), currentScope), this, currentScope.descend(inst));
        } else if (inst instanceof ReturnInstruction) {
          val = this.resolveValue(inst.returnValue(), currentScope);
        } else if (inst instanceof IfInstruction) {
          const cond = this.resolveValue(inst.condition(), currentScope);
          let exec = false;
          if (cond instanceof NumberType) {
            exec = cond.toDouble() > 0;
          } else {
            throw new RuntimeException("Non-number/bool value provided for 'if' instruction", inst);
          }

          let level = 1;
          const instCache: RtflInstruction[] = [];
          for (let j = i + 1; j < instructions.length && level > 0; j += 1) {
            const inner = instructions[j];
            if (inner instanceof IfInstruction || inner instanceof WhileInstruction || inner instanceof TryInstruction || inner instanceof FuncDefInstruction || inner instanceof AsyncInstruction) {
              level += 1;
              if (exec) {
                instCache.push(inner);
              }
            } else if (inner instanceof EndClauseInstruction) {
              level -= 1;
              if (level > 0 && exec) {
                instCache.push(inner);
              } else if (level === 0) {
                i = j;
              }
            } else if (exec) {
              instCache.push(inner);
            }
          }

          if (exec) {
            this.execute(instCache, currentScope.descend(inst));
          }
        } else if (inst instanceof WhileInstruction) {
          const body: RtflInstruction[] = [];
          let level = 1;
          for (let j = i + 1; j < instructions.length && level > 0; j += 1) {
            const inner = instructions[j];
            if (inner instanceof IfInstruction || inner instanceof WhileInstruction || inner instanceof TryInstruction || inner instanceof FuncDefInstruction || inner instanceof AsyncInstruction) {
              level += 1;
              body.push(inner);
            } else if (inner instanceof EndClauseInstruction) {
              level -= 1;
              if (level > 0) {
                body.push(inner);
              } else {
                i = j;
              }
            } else {
              body.push(inner);
            }
          }

          while (true) {
            const cond = this.resolveValue(inst.condition(), currentScope);
            if (cond instanceof NumberType) {
              if (cond.toDouble() > 0) {
                this.execute(body, currentScope.descend(inst));
              } else {
                break;
              }
            } else {
              throw new RuntimeException("Non-number/bool value provided for 'while' instruction", inst);
            }
          }
        } else if (inst instanceof TryInstruction) {
          const body: RtflInstruction[] = [];
          let level = 1;
          for (let j = i + 1; j < instructions.length && level > 0; j += 1) {
            const inner = instructions[j];
            if (inner instanceof IfInstruction || inner instanceof WhileInstruction || inner instanceof TryInstruction || inner instanceof FuncDefInstruction || inner instanceof AsyncInstruction) {
              level += 1;
              body.push(inner);
            } else if (inner instanceof EndClauseInstruction) {
              level -= 1;
              if (level > 0) {
                body.push(inner);
              } else {
                i = j;
              }
            } else {
              body.push(inner);
            }
          }

          currentScope.createLocalVar(inst.variableName(), new StringType("ok"));
          try {
            this.execute(body, currentScope.descend(inst));
          } catch (err) {
            if (err instanceof RuntimeException) {
              currentScope.assignVar(inst.variableName(), new StringType(err.message));
            } else {
              currentScope.assignVar(inst.variableName(), new StringType(String(err)));
            }
          }
        } else if (inst instanceof FuncDefInstruction) {
          const body: RtflInstruction[] = [];
          let level = 1;
          for (let j = i + 1; j < instructions.length && level > 0; j += 1) {
            const inner = instructions[j];
            if (inner instanceof IfInstruction || inner instanceof WhileInstruction || inner instanceof TryInstruction || inner instanceof FuncDefInstruction || inner instanceof AsyncInstruction) {
              level += 1;
              body.push(inner);
            } else if (inner instanceof EndClauseInstruction) {
              level -= 1;
              if (level > 0) {
                body.push(inner);
              } else {
                i = j;
              }
            } else {
              body.push(inner);
            }
          }

          this.functionsMap.set(inst.functionName(), new InstructionFunction(body, inst.argumentNames()));
        } else if (inst instanceof FuncUndefInstruction) {
          this.functionsMap.delete(inst.functionName());
        } else if (inst instanceof AsyncInstruction) {
          const body: RtflInstruction[] = [];
          let level = 1;
          for (let j = i + 1; j < instructions.length && level > 0; j += 1) {
            const inner = instructions[j];
            if (inner instanceof IfInstruction || inner instanceof WhileInstruction || inner instanceof TryInstruction || inner instanceof FuncDefInstruction || inner instanceof AsyncInstruction) {
              level += 1;
              body.push(inner);
            } else if (inner instanceof EndClauseInstruction) {
              level -= 1;
              if (level > 0) {
                body.push(inner);
              } else {
                i = j;
              }
            } else {
              body.push(inner);
            }
          }

          this.executeAsync(body, currentScope.descend(inst));
        } else if (inst instanceof DescendScopeInstruction) {
          currentScope = currentScope.descend(inst);
        } else if (inst instanceof AscendScopeInstruction) {
          const parent = currentScope.parent();
          if (parent) {
            currentScope = parent;
          }
        }
      } catch (err) {
        this.releaseLocalOwnership(disownAll ? Array.from(currentScope.variableAliases().values()) : localIds);
        if (err instanceof RuntimeException) {
          if (!err.cause()) {
            throw new RuntimeException(err.message, inst);
          }
          throw err;
        }
        throw err;
      }
    }

    this.releaseLocalOwnership(disownAll ? Array.from(currentScope.variableAliases().values()) : localIds);
    return val;
  }

  executeAsync(instructions: RtflInstruction[], scope: Scope): this {
    const asyncName = `RtflWorker-${this.newId()}`;
    for (const localId of scope.variableAliases().values()) {
      const local = this.localsMap.get(localId);
      if (local) {
        local.addOwner(asyncName);
      }
    }

    setImmediate(() => {
      this.withThread(asyncName, () => {
        try {
          this.execute(instructions, scope, true);
        } catch (err) {
          if (err instanceof RuntimeException) {
            const where = err.cause() ? `${err.cause()!.originFile()}:${err.cause()!.originLine()}` : "unknown:0";
            process.stderr.write(`(async) ${where} ${err.message}\n`);
          } else {
            process.stderr.write(`(async) unknown:0 ${String(err)}\n`);
          }
        }
      });
    });

    return this;
  }

  executeCode(code: string, scope?: Scope): RtflType {
    const consumer = { instructions: [] as RtflInstruction[] };
    const cacheConsumer = {
      consume: (inst: RtflInstruction) => consumer.instructions.push(inst),
      finish: () => {},
    };
    SourcecodeInstructionProducer.produce("eval", code, cacheConsumer);
    return this.execute(consumer.instructions, scope ?? this.topScope, true);
  }

  executeFile(filePath: string, scope?: Scope): RtflType {
    const execScope = scope ?? this.topScope;

    if (!fs.existsSync(filePath)) {
      throw new RuntimeException("Provided file does not exist");
    }

    if (!fs.statSync(filePath).isFile()) {
      throw new RuntimeException("Provided path is not a file");
    }

    const content = fs.readFileSync(filePath);

    if (RtflRuntime.isCompiledScript(content)) {
      const meta = RtflRuntime.readCompiledMetadata(content);
      if (meta.rtflVersion > RtflRuntime.RTFL_VERSION) {
        throw new RuntimeException(
          `Binary was compiled for a newer version of Rtfl (compiled for ${meta.rtflVersion}, running ${RtflRuntime.RTFL_VERSION})`
        );
      }
      const slice = content.subarray(meta.offset);
      const cache: RtflInstruction[] = [];
      const consumer = {
        consume: (inst: RtflInstruction) => cache.push(inst),
        finish: () => {},
      };
      BytecodeInstructionProducer.produce(meta.fileName, slice, consumer, meta.hasLineNumbers);
      return this.execute(cache, execScope);
    }

    const code = content.toString("utf8");
    const cache: RtflInstruction[] = [];
    const consumer = {
      consume: (inst: RtflInstruction) => cache.push(inst),
      finish: () => {},
    };
    SourcecodeInstructionProducer.produce(path.basename(filePath), code, consumer);
    return this.execute(cache, execScope);
  }

  functions(): Map<string, RtflFunction> {
    return this.functionsMap;
  }

  globalVariables(): Map<string, RtflType> {
    return this.globalsMap;
  }

  localVariables(): Map<number, LocalVar> {
    return this.localsMap;
  }

  garbageCollector(): GarbageCollector {
    return this.gc;
  }

  importStandard(): this {
    const std = new StandardFunctions();
    for (const [name, fn] of std.functions()) {
      this.functionsMap.set(name, fn);
    }
    return this;
  }

  importJavaInterop(): this {
    new JavaInteropFunctions(this);
    return this;
  }

  exposeMethodAs(object: Record<string, (...args: unknown[]) => unknown>, name: string, importName: string): this {
    const fn = object[name];
    if (typeof fn !== "function") {
      throw new Error(`Method ${name} is not a function`);
    }
    this.functionsMap.set(importName, new InteropFunction(object, fn));
    return this;
  }

  exposeMethod(object: Record<string, (...args: unknown[]) => unknown>, name: string): this {
    return this.exposeMethodAs(object, name, name);
  }

  exposeStaticMethodAs(target: Record<string, (...args: unknown[]) => unknown>, name: string, importName: string): this {
    return this.exposeMethodAs(target, name, importName);
  }

  exposeStaticMethod(target: Record<string, (...args: unknown[]) => unknown>, name: string): this {
    return this.exposeMethodAs(target, name, name);
  }

  newId(): number {
    const id = this.nextVarIdValue;
    this.nextVarIdValue += 1;
    return id;
  }

  createLocalVar(value: RtflType): LocalVar {
    return new LocalVar(value, this.threadNameValue);
  }

  currentThreadName(): string {
    return this.threadNameValue;
  }

  private withThread<T>(name: string, fn: () => T): T {
    const previous = this.threadNameValue;
    this.threadNameValue = name;
    try {
      return fn();
    } finally {
      this.threadNameValue = previous;
    }
  }

  private resolveValue(value: RtflType, scope: Scope): RtflType {
    if (value instanceof AssignmentType) {
      return value.extractValue(scope);
    }
    return value;
  }

  private resolveValues(values: RtflType[], scope: Scope): RtflType[] {
    return values.map((value) => (value instanceof AssignmentType ? value.extractValue(scope) : value));
  }

  private releaseLocalOwnership(ids: number[]): void {
    for (const id of ids) {
      const local = this.localsMap.get(id);
      if (local) {
        local.removeOwner(this.threadNameValue);
      }
    }
  }

  static readonly RTFL_VERSION = 4;
}

export class LocalVar {
  value: RtflType;
  private readonly owners: Set<string>;
  notInUse = false;

  constructor(value: RtflType, owner: string) {
    this.value = value;
    this.owners = new Set([owner]);
  }

  addOwner(owner: string): void {
    this.owners.add(owner);
    this.notInUse = false;
  }

  removeOwner(owner: string): void {
    this.owners.delete(owner);
    if (this.owners.size < 1) {
      this.notInUse = true;
    }
  }
}

export class GarbageCollector {
  private readonly intervalMs: number;
  private pausedState = false;
  private readonly runtime: RtflRuntime;
  private intervalHandle: NodeJS.Timeout;

  constructor(intervalMs: number, runtime: RtflRuntime) {
    this.intervalMs = intervalMs;
    this.runtime = runtime;
    this.intervalHandle = setInterval(() => {
      if (!this.pausedState) {
        this.collect();
      }
    }, this.intervalMs);
    this.intervalHandle.unref();
  }

  pause(): void {
    this.pausedState = true;
  }

  unpause(): void {
    this.pausedState = false;
  }

  paused(): boolean {
    return this.pausedState;
  }

  collect(): number {
    let deleted = 0;
    for (const [id, local] of this.runtime.localVariables()) {
      if (local.notInUse) {
        this.runtime.localVariables().delete(id);
        deleted += 1;
      }
    }
    return deleted;
  }

  stop(): void {
    clearInterval(this.intervalHandle);
  }
}

export interface RtflMetadata {
  fileName: string;
  compilerVersion: number;
  rtflVersion: number;
  hasLineNumbers: boolean;
  offset: number;
}

class InteropFunction implements RtflFunction {
  private readonly target: Record<string, (...args: unknown[]) => unknown>;
  private readonly func: (...args: unknown[]) => unknown;

  constructor(target: Record<string, (...args: unknown[]) => unknown>, func: (...args: unknown[]) => unknown) {
    this.target = target;
    this.func = func;
  }

  run(args: RtflType[], _runtime: RtflRuntime, _scope: Scope): RtflType {
    const jsArgs = args.map((arg) => RtflType.toJsValue(arg));
    const result = this.func.apply(this.target, jsArgs);
    return RtflType.fromJsValue(result);
  }
}
