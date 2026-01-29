import fs from "fs";
import path from "path";
import { execFileSync, spawnSync } from "child_process";
import { CacheInstructionConsumer } from "../consumers/CacheInstructionConsumer";
import type { RtflInstruction } from "../instructions";
import { SourcecodeInstructionProducer } from "../producers/SourcecodeInstructionProducer";
import type { RtflRuntime } from "./RtflRuntime";
import type { RtflFunction } from "./RtflFunction";
import type { Scope } from "./Scope";
import { RuntimeException } from "./RuntimeException";
import {
  ArrayType,
  BoolType,
  DoubleType,
  IntType,
  MapType,
  NullType,
  NumberType,
  RtflType,
  StringType,
} from "../types";
import { readFile, writeFile } from "../utils/IOUtils";
import { loadLibrary } from "../utils/LibraryLoader";

export class StandardFunctions {
  private readonly funcs = new Map<string, RtflFunction>();
  private readonly requiredFiles: Set<string> = new Set();

  constructor() {
    const requiredFiles = this.requiredFiles;
    this.funcs.set("print", {
      run(args: RtflType[], runtime: RtflRuntime): RtflType {
        for (const arg of args) {
          runtime.output(String(arg.value()));
        }
        return new NullType();
      },
    });

    this.funcs.set("println", {
      run(args: RtflType[], runtime: RtflRuntime): RtflType {
        for (const arg of args) {
          runtime.output(String(arg.value()));
        }
        runtime.output("\n");
        return new NullType();
      },
    });

    this.funcs.set("add", binaryNumberOp((a, b) => a + b));
    this.funcs.set("sub", binaryNumberOp((a, b) => a - b));
    this.funcs.set("mul", binaryNumberOp((a, b) => a * b));
    this.funcs.set("div", {
      run(args: RtflType[]): RtflType {
        if (args.length < 2) {
          throw new RuntimeException("Must provide at least 2 arguments");
        }
        if (args[0] instanceof NumberType && args[1] instanceof NumberType) {
          const result = args[0].toDouble() / args[1].toDouble();
          if (Number.isInteger(result)) {
            return new IntType(result);
          }
          return new DoubleType(result);
        }
        throw new RuntimeException("Provided non-number argument");
      },
    });

    this.funcs.set("sleep", {
      run(args: RtflType[]): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (!(args[0] instanceof NumberType)) {
          throw new RuntimeException("Provided non-number argument");
        }
        sleepSync(args[0].toInt());
        return new NullType();
      },
    });

    this.funcs.set("gc", {
      run(_args: RtflType[], runtime: RtflRuntime): RtflType {
        return new IntType(runtime.garbageCollector().collect());
      },
    });

    this.funcs.set("gc_pause", {
      run(_args: RtflType[], runtime: RtflRuntime): RtflType {
        runtime.garbageCollector().pause();
        return new NullType();
      },
    });

    this.funcs.set("gc_resume", {
      run(_args: RtflType[], runtime: RtflRuntime): RtflType {
        runtime.garbageCollector().unpause();
        return new NullType();
      },
    });

    this.funcs.set("eval", new EvalFunction(false, false));
    this.funcs.set("async", new EvalFunction(true, false));
    this.funcs.set("load", new EvalFunction(false, true));
    this.funcs.set("load_async", new EvalFunction(true, true));

    this.funcs.set("require", {
      run(args: RtflType[], runtime: RtflRuntime, scope: Scope): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (!(args[0] instanceof StringType)) {
          throw new RuntimeException("Provided non-string argument");
        }

        const pathArg = args[0].value();
        let filePath = pathArg;

        if (!pathArg.includes(".") && !pathArg.includes("/")) {
          const rtfcPath = path.join("libs", `${pathArg}.rtfc`);
          const rtflPath = path.join("libs", `${pathArg}.rtfl`);
          filePath = fs.existsSync(rtfcPath) ? rtfcPath : rtflPath;
        }

        const resolved = path.resolve(filePath);
        if (!requiredFiles.has(resolved)) {
          if (!fs.existsSync(resolved)) {
            throw new RuntimeException(`File/library "${pathArg}" does not exist`);
          }
          runtime.executeFile(resolved, scope);
          requiredFiles.add(resolved);
        }

        return new NullType();
      },
    });

    this.funcs.set("inc", {
      run(args: RtflType[], _runtime: RtflRuntime, scope: Scope): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (!(args[0] instanceof StringType)) {
          throw new RuntimeException("Provided non-string argument");
        }
        const varName = args[0].value();
        const varVal = scope.varValue(varName);
        if (varVal instanceof DoubleType) {
          scope.assignVar(varName, new DoubleType(varVal.toDouble() + 1));
        } else if (varVal instanceof IntType || varVal instanceof NumberType) {
          scope.assignVar(varName, new IntType(varVal.toInt() + 1));
        } else {
          throw new RuntimeException("Provided non-number argument");
        }
        return new NullType();
      },
    });

    this.funcs.set("dec", {
      run(args: RtflType[], _runtime: RtflRuntime, scope: Scope): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (!(args[0] instanceof StringType)) {
          throw new RuntimeException("Provided non-string argument");
        }
        const varName = args[0].value();
        const varVal = scope.varValue(varName);
        if (varVal instanceof DoubleType) {
          scope.assignVar(varName, new DoubleType(varVal.toDouble() - 1));
        } else if (varVal instanceof IntType || varVal instanceof NumberType) {
          scope.assignVar(varName, new IntType(varVal.toInt() - 1));
        } else {
          throw new RuntimeException("Provided non-number argument");
        }
        return new NullType();
      },
    });

    this.funcs.set("equals", {
      run(args: RtflType[], _runtime: RtflRuntime, scope: Scope): RtflType {
        if (args.length < 2) {
          throw new RuntimeException("Must provide at least 2 arguments");
        }
        return new BoolType(args[0].equals(args[1], scope));
      },
    });

    this.funcs.set("more_than", compareNumber((a, b) => a > b));
    this.funcs.set("less_than", compareNumber((a, b) => a < b));

    this.funcs.set("not", {
      run(args: RtflType[]): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (!(args[0] instanceof NumberType)) {
          throw new RuntimeException("Provided non-number/bool argument");
        }
        return new BoolType(!(args[0].toDouble() > 0));
      },
    });

    this.funcs.set("and", compareNumber((a, b) => a > 0 && b > 0));
    this.funcs.set("or", compareNumber((a, b) => a > 0 || b > 0));

    this.funcs.set("concat", {
      run(args: RtflType[]): RtflType {
        if (args.length < 2) {
          throw new RuntimeException("Must provide at least 2 arguments");
        }
        let result = args[0].value();
        let str = result === null || result === undefined ? "null" : String(result);
        for (let i = 1; i < args.length; i += 1) {
          const value = args[i].value();
          str += value === null || value === undefined ? "null" : String(value);
        }
        return new StringType(str);
      },
    });

    this.funcs.set("string_contains", {
      run(args: RtflType[]): RtflType {
        if (args.length < 2) {
          throw new RuntimeException("Must provide at least 2 arguments");
        }
        if (args[0] instanceof StringType && args[1] instanceof StringType) {
          return new BoolType(args[0].value().includes(args[1].value()));
        }
        throw new RuntimeException("Provided non-string argument");
      },
    });

    this.funcs.set("string_trim", {
      run(args: RtflType[]): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (!(args[0] instanceof StringType)) {
          throw new RuntimeException("Provided non-string argument");
        }
        return new StringType(args[0].value().trim());
      },
    });

    this.funcs.set("var", {
      run(args: RtflType[], _runtime: RtflRuntime, scope: Scope): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (!(args[0] instanceof StringType)) {
          throw new RuntimeException("Provided non-string argument");
        }
        return scope.varValue(args[0].value());
      },
    });

    this.funcs.set("to_string", {
      run(args: RtflType[]): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        const value = args[0].value();
        return new StringType(value === null || value === undefined ? "null" : String(value));
      },
    });

    this.funcs.set("read_file", {
      run(args: RtflType[]): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (!(args[0] instanceof StringType)) {
          throw new RuntimeException("Provided non-string argument");
        }
        const pathArg = args[0].value();
        try {
          return new StringType(readFile(pathArg));
        } catch (err) {
          if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
            throw new RuntimeException(`File "${pathArg}" does not exist`);
          }
          throw new RuntimeException(`Error reading file "${pathArg}": ${String(err)}`);
        }
      },
    });

    this.funcs.set("write_file", {
      run(args: RtflType[]): RtflType {
        if (args.length < 2) {
          throw new RuntimeException("Must provide at least 2 arguments");
        }
        if (!(args[0] instanceof StringType)) {
          throw new RuntimeException("Provided non-string path");
        }
        let append = false;
        if (args.length > 2) {
          if (args[2] instanceof BoolType) {
            append = args[2].value();
          } else {
            throw new RuntimeException("Provided non-bool type for append argument");
          }
        }
        const pathArg = args[0].value();
        const content = args[1].value();
        try {
          writeFile(pathArg, content === null || content === undefined ? "null" : String(content), append);
        } catch (err) {
          if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
            throw new RuntimeException(`File "${pathArg}" does not exist`);
          }
          throw new RuntimeException(`Error writing to file "${pathArg}": ${String(err)}`);
        }
        return new NullType();
      },
    });

    this.funcs.set("file_exists", {
      run(args: RtflType[]): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (!(args[0] instanceof StringType)) {
          throw new RuntimeException("Provided non-string path");
        }
        return new BoolType(fs.existsSync(args[0].value()));
      },
    });

    this.funcs.set("is_file", {
      run(args: RtflType[]): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (!(args[0] instanceof StringType)) {
          throw new RuntimeException("Provided non-string path");
        }
        const filePath = args[0].value();
        return new BoolType(fs.existsSync(filePath) && fs.statSync(filePath).isFile());
      },
    });

    this.funcs.set("is_directory", {
      run(args: RtflType[]): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (!(args[0] instanceof StringType)) {
          throw new RuntimeException("Provided non-string path");
        }
        const filePath = args[0].value();
        return new BoolType(fs.existsSync(filePath) && fs.statSync(filePath).isDirectory());
      },
    });

    this.funcs.set("delete_file", {
      run(args: RtflType[]): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (!(args[0] instanceof StringType)) {
          throw new RuntimeException("Provided non-string path");
        }
        const filePath = args[0].value();
        if (!fs.existsSync(filePath)) {
          throw new RuntimeException(`File "${filePath}" does not exist`);
        }
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          const files = fs.readdirSync(filePath);
          if (files.length > 0) {
            throw new RuntimeException("Cannot delete directories with files in them");
          }
        }
        fs.rmSync(filePath);
        return new NullType();
      },
    });

    this.funcs.set("list_files", {
      run(args: RtflType[]): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (!(args[0] instanceof StringType)) {
          throw new RuntimeException("Provided non-string path");
        }
        const dir = args[0].value();
        if (!fs.existsSync(dir)) {
          throw new RuntimeException(`Path "${dir}" does not exist`);
        }
        if (!fs.statSync(dir).isDirectory()) {
          throw new RuntimeException(`Path "${dir}" does not point to a directory`);
        }
        return new ArrayType(fs.readdirSync(dir).map((item) => new StringType(item)));
      },
    });

    this.funcs.set("create_directory", {
      run(args: RtflType[]): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (!(args[0] instanceof StringType)) {
          throw new RuntimeException("Provided non-string path");
        }
        fs.mkdirSync(args[0].value(), { recursive: true });
        return new NullType();
      },
    });

    this.funcs.set("move_file", {
      run(args: RtflType[]): RtflType {
        if (args.length < 2) {
          throw new RuntimeException("Must provide at least 2 arguments");
        }
        if (!(args[0] instanceof StringType && args[1] instanceof StringType)) {
          throw new RuntimeException("Provided non-string path");
        }
        fs.renameSync(args[0].value(), args[1].value());
        return new NullType();
      },
    });

    this.funcs.set("open_terminal", {
      run(_args: RtflType[], runtime: RtflRuntime): RtflType {
        runtime.openTerminal();
        return new NullType();
      },
    });

    this.funcs.set("close_terminal", {
      run(_args: RtflType[], runtime: RtflRuntime): RtflType {
        runtime.closeTerminal();
        return new NullType();
      },
    });

    this.funcs.set("terminal_open", {
      run(_args: RtflType[], runtime: RtflRuntime): RtflType {
        return new BoolType(runtime.terminalOpen());
      },
    });

    this.funcs.set("read_terminal", {
      run(_args: RtflType[], runtime: RtflRuntime): RtflType {
        return new StringType(runtime.readTerminal());
      },
    });

    this.funcs.set("exit", {
      run(args: RtflType[]): RtflType {
        const code = args.length > 0 && args[0] instanceof NumberType ? args[0].toInt() : 0;
        process.exit(code);
        return new NullType();
      },
    });

    this.funcs.set("system_property", {
      run(args: RtflType[]): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (!(args[0] instanceof StringType)) {
          throw new RuntimeException("Provided non-string property name");
        }
        const key = args[0].value();
        if (key === "user.dir") {
          return new StringType(process.cwd());
        }
        const env = process.env[key];
        return env === undefined ? new NullType() : new StringType(env);
      },
    });

    this.funcs.set("array", {
      run(args: RtflType[]): RtflType {
        return new ArrayType(args);
      },
    });

    this.funcs.set("array_add", {
      run(args: RtflType[]): RtflType {
        if (args.length < 2) {
          throw new RuntimeException("Must provide at least 2 arguments");
        }
        if (!(args[0] instanceof ArrayType)) {
          throw new RuntimeException("Did not provide array to add elements to");
        }
        for (let i = 1; i < args.length; i += 1) {
          args[0].items().push(args[i]);
        }
        return new NullType();
      },
    });

    this.funcs.set("array_contains", {
      run(args: RtflType[], _runtime: RtflRuntime, scope: Scope): RtflType {
        if (args.length < 2) {
          throw new RuntimeException("Must provide at least 2 arguments");
        }
        if (!(args[0] instanceof ArrayType)) {
          throw new RuntimeException("Did not provide array to search");
        }
        const arr = args[0].items();
        for (const elem of arr) {
          if (elem.equals(args[1], scope)) {
            return new BoolType(true);
          }
        }
        return new BoolType(false);
      },
    });

    this.funcs.set("array_remove", {
      run(args: RtflType[]): RtflType {
        if (args.length < 2) {
          throw new RuntimeException("Must provide at least 2 arguments");
        }
        if (!(args[0] instanceof ArrayType)) {
          throw new RuntimeException("Did not provide array to remove elements from");
        }
        const arr = args[0].items();
        const rem = args[1];
        if (rem instanceof NumberType) {
          arr.splice(rem.toInt(), 1);
        } else {
          for (let i = 0; i < arr.length; i += 1) {
            if (arr[i].value() === rem.value()) {
              arr.splice(i, 1);
              break;
            }
          }
        }
        return new NullType();
      },
    });

    this.funcs.set("array_get", {
      run(args: RtflType[]): RtflType {
        if (args.length < 2) {
          throw new RuntimeException("Must provide at least 2 arguments");
        }
        if (!(args[0] instanceof ArrayType)) {
          throw new RuntimeException("Did not provide array to read");
        }
        const arr = args[0].items();
        const index = args[1];
        if (!(index instanceof NumberType)) {
          throw new RuntimeException("Index must be a number");
        }
        const idx = index.toInt();
        if (idx < 0 || idx >= arr.length) {
          throw new RuntimeException(`Index ${idx} out of bounds (array length is ${arr.length})`);
        }
        return arr[idx];
      },
    });

    this.funcs.set("array_set", {
      run(args: RtflType[]): RtflType {
        if (args.length < 3) {
          throw new RuntimeException("Must provide at least 3 arguments");
        }
        if (!(args[0] instanceof ArrayType)) {
          throw new RuntimeException("Did not provide array to set");
        }
        const arr = args[0].items();
        const index = args[1];
        if (!(index instanceof NumberType)) {
          throw new RuntimeException("Index must be a number");
        }
        const idx = index.toInt();
        if (idx < 0 || idx >= arr.length) {
          throw new RuntimeException(`Index ${idx} out of bounds (array length is ${arr.length})`);
        }
        arr[idx] = args[2];
        return new NullType();
      },
    });

    this.funcs.set("array_length", {
      run(args: RtflType[]): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (!(args[0] instanceof ArrayType)) {
          throw new RuntimeException("Did not provide array to measure");
        }
        return new IntType(args[0].items().length);
      },
    });

    this.funcs.set("split", {
      run(args: RtflType[]): RtflType {
        if (args.length < 2) {
          throw new RuntimeException("Must provide at least 2 arguments");
        }
        if (!(args[0] instanceof StringType && args[1] instanceof StringType)) {
          throw new RuntimeException("Provided non-string argument");
        }
        const regex = new RegExp(args[1].value());
        const bits = args[0].value().split(regex);
        return new ArrayType(bits.map((bit) => new StringType(bit)));
      },
    });

    this.funcs.set("index_of", {
      run(args: RtflType[]): RtflType {
        if (args.length < 2) {
          throw new RuntimeException("Must provide at least 2 arguments");
        }
        if (!(args[0] instanceof StringType && args[1] instanceof StringType)) {
          throw new RuntimeException("Provided non-string argument");
        }
        return new IntType(args[0].value().indexOf(args[1].value()));
      },
    });

    this.funcs.set("starts_with", {
      run(args: RtflType[]): RtflType {
        if (args.length < 2) {
          throw new RuntimeException("Must provide at least 2 arguments");
        }
        if (!(args[0] instanceof StringType && args[1] instanceof StringType)) {
          throw new RuntimeException("Provided non-string argument");
        }
        return new BoolType(args[0].value().startsWith(args[1].value()));
      },
    });

    this.funcs.set("ends_with", {
      run(args: RtflType[]): RtflType {
        if (args.length < 2) {
          throw new RuntimeException("Must provide at least 2 arguments");
        }
        if (!(args[0] instanceof StringType && args[1] instanceof StringType)) {
          throw new RuntimeException("Provided non-string argument");
        }
        return new BoolType(args[0].value().endsWith(args[1].value()));
      },
    });

    this.funcs.set("string_replace", {
      run(args: RtflType[]): RtflType {
        if (args.length < 3) {
          throw new RuntimeException("Must provide at least 3 arguments");
        }
        if (!(args[0] instanceof StringType && args[1] instanceof StringType && args[2] instanceof StringType)) {
          throw new RuntimeException("Provided non-string argument");
        }
        const str = args[0].value();
        const search = args[1].value();
        const replaceVal = args[2].value();
        return new StringType(str.split(search).join(replaceVal));
      },
    });

    this.funcs.set("substring", {
      run(args: RtflType[]): RtflType {
        if (args.length < 2) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (!(args[0] instanceof StringType)) {
          throw new RuntimeException("Provided non-string argument");
        }
        if (!(args[1] instanceof NumberType)) {
          throw new RuntimeException("Starting index must be a number");
        }
        const str = args[0].value();
        const start = args[1].toInt();
        const end = args.length > 2 && args[2] instanceof NumberType ? args[2].toInt() : str.length;
        try {
          return new StringType(str.substring(start, end));
        } catch (err) {
          throw new RuntimeException("String range is out of bounds");
        }
      },
    });

    this.funcs.set("char_at", {
      run(args: RtflType[]): RtflType {
        if (args.length < 2) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (!(args[0] instanceof StringType)) {
          throw new RuntimeException("Provided non-string argument");
        }
        if (!(args[1] instanceof NumberType)) {
          throw new RuntimeException("Character index must be a number");
        }
        const str = args[0].value();
        const index = args[1].toInt();
        if (index < 0 || index >= str.length) {
          throw new RuntimeException("Character index is out of bounds");
        }
        return new StringType(str.charAt(index));
      },
    });

    this.funcs.set("string_length", {
      run(args: RtflType[]): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (!(args[0] instanceof StringType)) {
          throw new RuntimeException("Did not provide string to measure");
        }
        return new IntType(args[0].value().length);
      },
    });

    this.funcs.set("type", {
      run(args: RtflType[]): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        let type = "";
        if (args[0] instanceof ArrayType) {
          type = "array";
        } else if (args[0] instanceof BoolType) {
          type = "boolean";
        } else if (args[0] instanceof NumberType) {
          type = "number";
        } else if (args[0] instanceof NullType) {
          type = "null";
        } else if (args[0] instanceof StringType) {
          type = "string";
        } else {
          type = args[0].name().toLowerCase();
        }
        return new StringType(type);
      },
    });

    this.funcs.set("to_number", {
      run(args: RtflType[]): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (args[0] instanceof NumberType) {
          return args[0];
        }
        if (args[0] instanceof BoolType) {
          return new IntType(args[0].toInt());
        }
        if (args[0] instanceof StringType) {
          const str = args[0].value();
          const parsed = str.includes(".") ? Number.parseFloat(str) : Number.parseInt(str, 10);
          if (Number.isNaN(parsed)) {
            throw new RuntimeException(`String "${str}" does not represent a number`);
          }
          return str.includes(".") ? new DoubleType(parsed) : new IntType(parsed);
        }
        throw new RuntimeException(`Cannot convert "${args[0]}" to number`);
      },
    });

    this.funcs.set("read_http", {
      run(args: RtflType[]): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (!(args[0] instanceof StringType)) {
          throw new RuntimeException("Provided non-string argument");
        }
        const url = args[0].value();
        const method = args.length > 1 && args[1] instanceof StringType ? args[1].value() : "GET";
        try {
          const output = execFileSync("curl", ["-s", "-X", method, url], { encoding: "utf8" });
          return new StringType(output);
        } catch (err) {
          throw new RuntimeException(`Failed to load URL: ${String(err)}`);
        }
      },
    });

    this.funcs.set("exec", {
      run(args: RtflType[]): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        const procArgs = args.map((arg) => String(arg.value()));
        const command = procArgs.shift();
        if (!command) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        const result = spawnSync(command, procArgs, { encoding: "utf8" });
        if (result.error) {
          throw new RuntimeException(`Failed to execute process: ${result.error.message}`);
        }
        return new StringType((result.stdout ?? "") + (result.stderr ?? ""));
      },
    });

    this.funcs.set("map", {
      run(): RtflType {
        return new MapType();
      },
    });

    this.funcs.set("map_keys", {
      run(args: RtflType[]): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (!(args[0] instanceof MapType)) {
          throw new RuntimeException("Provided non-map argument");
        }
        return new ArrayType(Array.from(args[0].entries().keys()).map((key) => new StringType(key)));
      },
    });

    this.funcs.set("map_values", {
      run(args: RtflType[]): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (!(args[0] instanceof MapType)) {
          throw new RuntimeException("Provided non-map argument");
        }
        return new ArrayType(Array.from(args[0].entries().values()));
      },
    });

    this.funcs.set("map_contains_key", {
      run(args: RtflType[]): RtflType {
        if (args.length < 2) {
          throw new RuntimeException("Must provide at least 2 arguments");
        }
        if (!(args[0] instanceof MapType)) {
          throw new RuntimeException("Provided non-map argument");
        }
        return new BoolType(args[0].entries().has(String(args[1].value())));
      },
    });

    this.funcs.set("map_put", {
      run(args: RtflType[]): RtflType {
        if (args.length < 3) {
          throw new RuntimeException("Must provide at least 3 arguments");
        }
        if (!(args[0] instanceof MapType)) {
          throw new RuntimeException("Provided non-map argument");
        }
        if (!(args[1] instanceof StringType)) {
          throw new RuntimeException("Key must be a string");
        }
        args[0].entries().set(args[1].value(), args[2]);
        return new NullType();
      },
    });

    this.funcs.set("map_set", this.funcs.get("map_put")!);

    this.funcs.set("map_get", {
      run(args: RtflType[]): RtflType {
        if (args.length < 2) {
          throw new RuntimeException("Must provide at least 2 arguments");
        }
        if (!(args[0] instanceof MapType)) {
          throw new RuntimeException("Provided non-map argument");
        }
        if (!(args[1] instanceof StringType)) {
          throw new RuntimeException("Key must be a string");
        }
        return args[0].entries().get(args[1].value()) ?? new NullType();
      },
    });

    this.funcs.set("map_remove", {
      run(args: RtflType[]): RtflType {
        if (args.length < 2) {
          throw new RuntimeException("Must provide at least 2 arguments");
        }
        if (!(args[0] instanceof MapType)) {
          throw new RuntimeException("Provided non-map argument");
        }
        if (!(args[1] instanceof StringType)) {
          throw new RuntimeException("Key must be a string");
        }
        args[0].entries().delete(args[1].value());
        return new NullType();
      },
    });

    this.funcs.set("to_json", new JsonParseFunction(false));
    this.funcs.set("from_json", new JsonParseFunction(true));

    this.funcs.set("restrict", {
      run(args: RtflType[], _runtime: RtflRuntime, scope: Scope): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (!(args[0] instanceof StringType)) {
          throw new RuntimeException("Provided non-string argument");
        }
        if (scope.parent()) {
          scope.parent()!.restrictFunc(args[0].value());
        }
        return new NullType();
      },
    });

    this.funcs.set("library", {
      run(args: RtflType[], runtime: RtflRuntime): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (!(args[0] instanceof StringType)) {
          throw new RuntimeException("Provided non-string argument");
        }
        const libraryPath = args[0].value();
        try {
          const lib = loadLibrary(libraryPath);
          lib.initialize(runtime);
        } catch (err) {
          throw new RuntimeException(`Failed to load library: ${String(err)}`);
        }
        return new NullType();
      },
    });

    this.funcs.set("throw", {
      run(args: RtflType[]): RtflType {
        if (args.length < 1) {
          throw new RuntimeException("Must provide at least 1 argument");
        }
        if (!(args[0] instanceof StringType)) {
          throw new RuntimeException("Provided non-string argument");
        }
        throw new RuntimeException(args[0].value());
      },
    });

    this.funcs.set("copy_func", {
      run(args: RtflType[], runtime: RtflRuntime, scope: Scope): RtflType {
        if (args.length < 2) {
          throw new RuntimeException("Must provide at least two arguments");
        }
        if (!(args[0] instanceof StringType && args[1] instanceof StringType)) {
          throw new RuntimeException("Provided non-string argument");
        }
        const existing = scope.function(args[0].value());
        runtime.functions().set(args[1].value(), existing);
        return new NullType();
      },
    });
  }

  functions(): Map<string, RtflFunction> {
    return this.funcs;
  }
}

function binaryNumberOp(operation: (a: number, b: number) => number): RtflFunction {
  return {
    run(args: RtflType[]): RtflType {
      if (args.length < 2) {
        throw new RuntimeException("Must provide at least 2 arguments");
      }
      if (!(args[0] instanceof NumberType && args[1] instanceof NumberType)) {
        throw new RuntimeException("Provided non-number argument");
      }
      const result = operation(args[0].toDouble(), args[1].toDouble());
      if (args[0] instanceof DoubleType || args[1] instanceof DoubleType) {
        return new DoubleType(result);
      }
      return new IntType(result);
    },
  };
}

function compareNumber(predicate: (a: number, b: number) => boolean): RtflFunction {
  return {
    run(args: RtflType[]): RtflType {
      if (args.length < 2) {
        throw new RuntimeException("Must provide at least 2 arguments");
      }
      if (!(args[0] instanceof NumberType && args[1] instanceof NumberType)) {
        throw new RuntimeException("Provided non-number argument");
      }
      return new BoolType(predicate(args[0].toDouble(), args[1].toDouble()));
    },
  };
}

function sleepSync(ms: number): void {
  if (ms <= 0) {
    return;
  }
  const sab = new SharedArrayBuffer(4);
  const int32 = new Int32Array(sab);
  Atomics.wait(int32, 0, 0, ms);
}

class EvalFunction implements RtflFunction {
  private readonly asyncFlag: boolean;
  private readonly fromFile: boolean;

  constructor(asyncFlag: boolean, fromFile: boolean) {
    this.asyncFlag = asyncFlag;
    this.fromFile = fromFile;
  }

  run(args: RtflType[], runtime: RtflRuntime, scope: Scope): RtflType {
    let result: RtflType = new NullType();
    if (args.length < 1) {
      throw new RuntimeException("Must provide at least 1 argument");
    }
    if (!(args[0] instanceof StringType)) {
      throw new RuntimeException("Provided non-string argument");
    }

    if (this.fromFile) {
      const filePath = args[0].value();
      runtime.executeFile(filePath, scope);
      return new NullType();
    }

    const code = args[0].value();
    const cache = new CacheInstructionConsumer();
    try {
      SourcecodeInstructionProducer.produce("eval", code, cache);
      if (this.asyncFlag) {
        runtime.executeAsync(cache.cache, scope);
      } else {
        result = runtime.execute(cache.cache, scope);
      }
    } catch (err) {
      if (err instanceof RuntimeException) {
        throw err;
      }
      throw new RuntimeException(String(err));
    }

    return result;
  }
}

class JsonParseFunction implements RtflFunction {
  private readonly toMap: boolean;

  constructor(toMap: boolean) {
    this.toMap = toMap;
  }

  run(args: RtflType[]): RtflType {
    if (args.length < 1) {
      throw new RuntimeException("Must provide at least 1 argument");
    }

    if (this.toMap) {
      if (!(args[0] instanceof StringType)) {
        throw new RuntimeException("Provided non-string argument");
      }
      try {
        const parsed = JSON.parse(args[0].value());
        return toRtflValue(parsed);
      } catch (err) {
        throw new RuntimeException(`Failed to parse JSON: ${String(err)}`);
      }
    }

    if (!(args[0] instanceof MapType)) {
      throw new RuntimeException("Provided non-map argument");
    }

    const pretty = args.length > 1 && args[1] instanceof BoolType ? args[1].value() : false;
    const json = JSON.stringify(mapToJson(args[0]), null, pretty ? 2 : 0);
    return new StringType(json);
  }
}

function mapToJson(mapType: MapType): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [key, value] of mapType.entries()) {
    if (value instanceof MapType) {
      obj[key] = mapToJson(value);
    } else if (value instanceof ArrayType) {
      obj[key] = arrayToJson(value);
    } else {
      obj[key] = value.value();
    }
  }
  return obj;
}

function arrayToJson(arrayType: ArrayType): unknown[] {
  return arrayType.items().map((val) => {
    if (val instanceof MapType) {
      return mapToJson(val);
    }
    if (val instanceof ArrayType) {
      return arrayToJson(val);
    }
    return val.value();
  });
}

function toRtflValue(value: unknown): RtflType {
  if (Array.isArray(value)) {
    return new ArrayType(value.map((item) => toRtflValue(item)));
  }
  if (value === null || value === undefined) {
    return new NullType();
  }
  if (typeof value === "boolean") {
    return new BoolType(value);
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? new IntType(value) : new DoubleType(value);
  }
  if (typeof value === "string") {
    return new StringType(value);
  }
  if (typeof value === "object") {
    const map = new Map<string, RtflType>();
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      map.set(key, toRtflValue(entry));
    }
    return new MapType(map);
  }
  return new NullType();
}
