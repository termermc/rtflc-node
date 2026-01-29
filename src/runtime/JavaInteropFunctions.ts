import type { RtflRuntime } from "./RtflRuntime";
import type { RtflFunction } from "./RtflFunction";
import {
  JavaObjectWrapperType,
  NullType,
  RtflType,
  StringType,
} from "../types";
import { RuntimeException } from "./RuntimeException";

export class JavaInteropFunctions {
  constructor(runtime: RtflRuntime) {
    runtime.functions().set("java", this.javaFunction());
    runtime.functions().set("jmethod", this.jmethodFunction());
  }

  private javaFunction(): RtflFunction {
    return {
      run: (args: RtflType[]): RtflType => {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (!(args[0] instanceof StringType)) {
          throw new RuntimeException("Provided non-string argument");
        }
        const name = args[0].value();
        const ctor = resolveInteropTarget(name);
        if (typeof ctor !== "function") {
          throw new RuntimeException("No constructor exists with the specified argument types");
        }
        const jsArgs = args.slice(1).map((arg) => RtflType.toJsValue(arg));
        const instance = new (ctor as new (...params: unknown[]) => unknown)(...jsArgs);
        return RtflType.fromJsValue(instance);
      },
    };
  }

  private jmethodFunction(): RtflFunction {
    return {
      run: (args: RtflType[]): RtflType => {
        if (args.length < 2) {
          throw new RuntimeException("Must provide at least 2 arguments");
        }
        if (!(args[1] instanceof StringType)) {
          throw new RuntimeException("Provided non-string method name");
        }

        const target = args[0] instanceof JavaObjectWrapperType ? args[0].value() : args[0].value();
        if (target === null || target === undefined) {
          throw new RuntimeException("Provided null object for method call");
        }

        const methodName = args[1].value();
        const method = (target as Record<string, unknown>)[methodName];
        if (typeof method !== "function") {
          throw new RuntimeException(`No method exists with the specified name: ${methodName}`);
        }

        const jsArgs = args.slice(2).map((arg) => RtflType.toJsValue(arg));
        const result = (method as (...params: unknown[]) => unknown).apply(target, jsArgs);
        return result === undefined ? new NullType() : RtflType.fromJsValue(result);
      },
    };
  }
}

function resolveInteropTarget(name: string): unknown {
  const globalTarget = (globalThis as Record<string, unknown>)[name];
  if (globalTarget) {
    return globalTarget;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(name);
    return mod?.default ?? mod;
  } catch {
    return null;
  }
}
