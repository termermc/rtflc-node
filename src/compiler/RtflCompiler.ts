import fs from "fs";
import path from "path";
import { CompilerInstructionConsumer } from "../consumers/CompilerInstructionConsumer";
import type { InstructionConsumer } from "../consumers/InstructionConsumer";
import {
  AscendScopeInstruction,
  DescendScopeInstruction,
  FuncCallInstruction,
  RtflInstruction,
} from "../instructions";
import { BytecodeInstructionProducer } from "../producers/BytecodeInstructionProducer";
import { SourcecodeInstructionProducer } from "../producers/SourcecodeInstructionProducer";
import { RtflRuntime } from "../runtime/RtflRuntime";
import { RuntimeException } from "../runtime/RuntimeException";
import { StringType } from "../types";
import { ByteWriter } from "../utils/ByteIO";
import { CompilerOptions } from "./CompilerOptions";

export class RtflCompiler {
  static readonly COMPILER_VERSION = 0;
  static readonly RTFL_VERSION = 4;

  private readonly optionsValue: CompilerOptions;
  private readonly requires: Set<string> = new Set();
  private readonly loads: Set<string> = new Set();

  constructor(options: CompilerOptions) {
    this.optionsValue = options;
  }

  options(): CompilerOptions {
    return this.optionsValue;
  }

  requiresLoaded(): Set<string> {
    return this.requires;
  }

  loadsCompiled(): Set<string> {
    return this.loads;
  }

  compile(filePath: string, output: ByteWriter, writeMetadata = true): void {
    const inputBuffer = fs.readFileSync(filePath);
    const consumer = new CompilerInstructionConsumer(output, this.optionsValue.preserveLineNumbersEnabled());
    const compConsumer = new CompilerConsumer(this, consumer, output);

    if (writeMetadata) {
      output.writeBytes(Buffer.from([1, 3, 3, 7]));
      output.writeByte(RtflCompiler.COMPILER_VERSION);
      output.writeByte(RtflCompiler.RTFL_VERSION);
      const name = path.basename(filePath);
      output.writeByte(name.length);
      output.writeString(name);
      output.writeByte(this.optionsValue.preserveLineNumbersEnabled() ? 1 : 0);
    }

    if (RtflRuntime.isCompiledScript(inputBuffer)) {
      const meta = RtflRuntime.readCompiledMetadata(inputBuffer);
      if (!writeMetadata) {
        this.swapSource(meta.fileName, output);
      }
      const slice = inputBuffer.subarray(meta.offset);
      BytecodeInstructionProducer.produce(meta.fileName, slice, compConsumer, this.optionsValue.preserveLineNumbersEnabled());
    } else {
      const content = inputBuffer.toString("utf8");
      SourcecodeInstructionProducer.produce(path.basename(filePath), content, compConsumer);
    }
  }

  private swapSource(source: string, output: ByteWriter): void {
    if (this.optionsValue.preserveLineNumbersEnabled()) {
      output.writeBytes(Buffer.from([0, 0]));
    }
    output.writeByte(13);
    output.writeByte(source.length);
    output.writeString(source);
  }
}

class CompilerConsumer implements InstructionConsumer {
  private readonly compiler: RtflCompiler;
  private readonly consumer: InstructionConsumer;
  private readonly output: ByteWriter;

  constructor(compiler: RtflCompiler, consumer: InstructionConsumer, output: ByteWriter) {
    this.compiler = compiler;
    this.consumer = consumer;
    this.output = output;
  }

  consume(inst: RtflInstruction): void {
    if (inst instanceof FuncCallInstruction) {
      const ins = inst;
      let writeInst = true;

      if (
        ins.functionArguments().length > 0 &&
        ins.functionArguments()[0] instanceof StringType &&
        (ins.functionName() === "load" || ins.functionName() === "require")
      ) {
        const arg = (ins.functionArguments()[0] as StringType).value();
        let filePath = arg;

        if (ins.functionName() === "require") {
          if (!arg.includes(".") && !arg.includes("/")) {
            const rtfcPath = path.join("libs", `${arg}.rtfc`);
            const rtflPath = path.join("libs", `${arg}.rtfl`);
            filePath = fs.existsSync(rtfcPath) ? rtfcPath : rtflPath;
          }
        }

        const file = path.resolve(filePath);
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
          throw new RuntimeException(
            `Path specified in ${ins.functionName()} at ${inst.originFile()}:${inst.originLine()} is not a file`
          );
        }

        if (ins.functionName() === "load") {
          if (this.compiler.options().packageLiteralLoadsEnabled()) {
            writeInst = false;
            this.consumer.consume(new DescendScopeInstruction());
            this.swapSource(path.basename(file), this.output);
            this.compiler.compile(file, this.output, false);
            this.swapSource(inst.originFile(), this.output);
            this.consumer.consume(new AscendScopeInstruction());
          } else if (this.compiler.options().compileLiteralLoadsEnabled()) {
            writeInst = false;
            let compPath = arg;
            if (compPath.endsWith(".rtfl")) {
              compPath = `${compPath.slice(0, -1)}c`;
            } else {
              compPath = `${compPath}.rtfc`;
            }

            if (!this.compiler.loadsCompiled().has(file)) {
              const writer = new ByteWriter();
              this.compiler.compile(file, writer, true);
              writer.writeToFile(compPath);
              this.compiler.loadsCompiled().add(file);
            }

            this.consumer.consume(
              new FuncCallInstruction(inst.originFile(), inst.originLine(), "load", [new StringType(compPath)])
            );
          }
        } else if (ins.functionName() === "require") {
          if (this.compiler.options().packageLiteralRequiresEnabled()) {
            writeInst = false;
            if (!this.compiler.requiresLoaded().has(file)) {
              this.consumer.consume(new DescendScopeInstruction());
              this.swapSource(path.basename(file), this.output);
              this.compiler.compile(file, this.output, false);
              this.swapSource(inst.originFile(), this.output);
              this.consumer.consume(new AscendScopeInstruction());
              this.compiler.requiresLoaded().add(file);
            }
          } else if (this.compiler.options().compileLiteralRequiresEnabled()) {
            writeInst = false;
            let compPath = file;
            if (compPath.endsWith(".rtfl")) {
              compPath = `${compPath.slice(0, -1)}c`;
            } else {
              compPath = `${compPath}.rtfc`;
            }

            if (!this.compiler.requiresLoaded().has(file)) {
              const writer = new ByteWriter();
              this.compiler.compile(file, writer, true);
              writer.writeToFile(compPath);
              this.compiler.requiresLoaded().add(file);
            }

            this.consumer.consume(
              new FuncCallInstruction(inst.originFile(), inst.originLine(), "require", [new StringType(arg)])
            );
          }
        }
      }

      if (writeInst) {
        this.consumer.consume(inst);
      }
    } else {
      this.consumer.consume(inst);
    }
  }

  finish(): void {}

  private swapSource(source: string, output: ByteWriter): void {
    if (this.compiler.options().preserveLineNumbersEnabled()) {
      output.writeBytes(Buffer.from([0, 0]));
    }
    output.writeByte(13);
    output.writeByte(source.length);
    output.writeString(source);
  }
}
