#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { ArgParser } from "./utils/ArgParser";
import { CompilerOptions } from "./compiler/CompilerOptions";
import { RtflCompiler } from "./compiler/RtflCompiler";
import { ProducerException } from "./producers/ProducerException";
import { RtflRuntime } from "./runtime/RtflRuntime";
import { RuntimeException } from "./runtime/RuntimeException";
import { ArrayType, StringType } from "./types";
import { ByteWriter } from "./utils/ByteIO";

const RTFLC_VERSION = 1.3;
const RTFL_VERSION = 1.4;

const arg = new ArgParser(process.argv.slice(2));

if (arg.option("help") || arg.flag("h")) {
  const scriptName = path.basename(process.argv[1] ?? "rtflc-node");
  process.stdout.write(
    `node ${scriptName} <SCRIPT/BINARY> [OPTIONS]\n\n` +
      "-h, --help                      prints this message\n" +
      "-v, --version                   prints the version of Rtfl supported and the version of Rtflc running\n" +
      "-c, --compile                   compiles the specified script\n" +
      "-t, --time                      displays the time it took to execute or compile the provided script/binary (in milliseconds)\n" +
      "-l, --compile-literal-loads     compiles all scripts or binaries that are referenced with `load()` calls with literal string paths in them, and references the compiled versions\n" +
      "-r, --compile-literal-requires  compiles all scripts or binaries that are referenced with `require()` calls with literal string paths in them, and references the compiled versions\n" +
      "-p, --package-literal-loads     packages all scripts or binaries that are referenced with `load()` calls into the compiled binary output instead of referencing them\n" +
      "-e, --package-literal-requires  packages all scripts or binaries that are references with `require()` calls into the compiled binary output instead of referencing them\n" +
      "-n, --preserve-line-numbers     preserves line numbers for instructions in compiled binaries for debugging purposes\n" +
      "-i, --disable-interop           disables JS/Rtfl interop functions\n" +
      "--out=FILENAME                  specifies the path to output the compiled binary to\n\n" +
      "Examples:\n" +
      `  node ${scriptName} script.rtfl --time  Executes script.rtfl and outputs the time it took to execute it\n` +
      `  node ${scriptName} script.rtfl --compile --package-literal-loads Compiles script.rtfl and packages all load() calls with literal paths specified\n`
  );
} else if (arg.option("version") || arg.flag("v")) {
  process.stdout.write(`Supporting Rtfl version ${RTFL_VERSION}, running Rtflc ${RTFLC_VERSION}\n`);
} else if (arg.arguments().length > 0) {
  const file = arg.arguments()[0];
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    if (arg.option("compile") || arg.flag("c")) {
      const compiler = new RtflCompiler(
        new CompilerOptions()
          .compileLiteralLoads(arg.option("compile-literal-loads") || arg.flag("l"))
          .compileLiteralRequires(arg.option("compile-literal-requires") || arg.flag("r"))
          .packageLiteralLoads(arg.option("package-literal-loads") || arg.flag("p"))
          .packageLiteralRequires(arg.option("package-literal-requires") || arg.flag("e"))
          .preserveLineNumbers(arg.option("preserve-line-numbers") || arg.flag("n"))
      );

      let outPath = file;
      const outArg = arg.optionString("out");
      if (outArg) {
        outPath = outArg;
      } else if (outPath.endsWith(".rtfl")) {
        outPath = `${outPath.slice(0, -1)}c`;
      } else {
        outPath = `${outPath}.rtfc`;
      }

      try {
        const startMs = Date.now();
        const writer = new ByteWriter();
        compiler.compile(file, writer, true);
        writer.writeToFile(outPath);
        const endMs = Date.now();
        if (arg.option("time") || arg.flag("t")) {
          process.stdout.write(`Took ${endMs - startMs}ms to compile file\n`);
        }
      } catch (err) {
        process.stderr.write("Failed to compile file:\n");
        process.stderr.write(`${String(err)}\n`);
      }
    } else {
      const runtime = new RtflRuntime().importStandard();
      if (!arg.option("disable-interop") && !arg.flag("i")) {
        runtime.importJavaInterop();
      }

      const rtflArgs = new ArrayType();
      for (let i = 1; i < arg.arguments().length; i += 1) {
        rtflArgs.items().push(new StringType(arg.arguments()[i]));
      }
      runtime.globalVariables().set("args", rtflArgs);

      try {
        const startMs = Date.now();
        runtime.executeFile(file);
        const endMs = Date.now();
        if (arg.option("time") || arg.flag("t")) {
          process.stdout.write(`Took ${endMs - startMs}ms to read and execute file\n`);
        }
      } catch (err) {
        if (err instanceof RuntimeException) {
          const cause = err.cause();
          const where = cause ? `${cause.originFile()}:${cause.originLine()}` : "unknown:0";
          process.stderr.write(`${where} ${err.message}\n`);
        } else if (err instanceof ProducerException) {
          process.stderr.write(`Failed to execute file: ${err.message}\n`);
        } else {
          process.stderr.write(`Failed to execute file: ${String(err)}\n`);
        }
      }
    }
  } else {
    process.stdout.write("Specified path does not point to a file\n");
  }
} else {
  process.stdout.write("Please provide a path to an Rtfl file or specify --help\n");
}
