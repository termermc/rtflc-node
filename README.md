# Rtflc Node

This is a direct port of [Rtflc](https://github.com/termermc/rtflc) to TypeScript for Node.js.

It implements the full compiler and runtime from the original, as well as exporting its API.

## Setup

```bash
npm install
npm run build
node dist/src/cli.js --help
```

## Porting Process

Rtflc was ported from Java to TypeScript in about 30 minutes by OpenAI Codex using gpt-5.2-codex (high).
As far as I can tell, the port is fully functional and bug-free (as far as the original was bug-free).
I verified that bytecode outputs from the port and the original are identical, and running real programs
works as expected.

Before using Codex, cloned the original Rtflc repo and cloned the [docs](https://git.termer.net/rtfl/docs) repo in a subdirectory.
I also copied several working programs into an `examples` folder, and the original implementation's
[README.txt](https://github.com/termermc/rtfl/blob/master/README.txt) as `old_design_document.txt`.

After doing that, I used the following prompts in sequence:

```
Port this programming language runtime to Node.js with TypeScript and make sure simple test programs run properly.
Read the README.md, docs in `./docs/` and `old_design_document.txt` before starting the porting process.
```

```
It doesn't parse properly.
I tried this:

``
$ node dist/src/cli.js examples/rtflshell/main.rtfl
Failed to execute file: Encountered invalid value expression: ![__err = "ok"] (at main.rtfl:16)
``

Write some simple programs that cover the syntax used in the example programs and also in the old design document, and make sure they work. Include them as part of the test suite to make sure they run and produce the correct result.
```

```
Write some benchmark Rtfl files for me to test the performance of the TypeScript version against the old Java version.
```

The whole process took about 30 minutes.

I manually verified that programs were working, then ran the benchmarks.

## Benchmarks

My machine:
 - CPU: Ryzen 5 3600
 - OS: Linux 6.18.6-arch1-1 x86_64
 - Node: v25.4.0
 - Java: openjdk version "21.0.10" 2026-01-20

All tests include JVM and Node startup times.
All times are in milliseconds.

### [arith_loop.rtfl](benchmarks/arith_loop.rtfl)

Java: 225.37
Node: 432.99

### [array_ops.rtfl](benchmarks/array_ops.rtfl)

Java: 144.66
Node: 159.06

### [function_calls.rtfl](benchmarks/function_calls.rtfl)

Java: 361.62
Node: 472.33

### [map_ops.rtfl](benchmarks/map_ops.rtfl)

Java: 216.34
Node: 157.58

### [string_concat.rtfl](benchmarks/string_concat.rtfl)

Java: 494.62
Node: 87.54

---

The Java version is faster than the Node version on all benchmarks except map_ops.rtfl and string_concat.rtfl,
the latter of which runs over 5x faster in Node.

My guess is that the map and string benchmarks run faster because V8 is better optimized for dynamic data structures
and strings, which makes sense for a dynamically typed language like JavaScript.

## Remarks

I did not expect OpenAI Codex to succeed in porting Rtflc to TypeScript.

I had previously tried it and other porting projects with Claude Code to no avail.

While I have had mixed results with agents such as Codex and Claude Code for iterative tasks on existing and greenfield
projects, it seems that Codex excels at direct ports of small projects when proper testing is used throughout the process.

I believe what sets this project apart from others I have tried in the past is the fact I put more effort into giving the
agent enough information to understand how the project works, along with example programs that use the project.
The additional documentation combined with example programs to run seems to have helped Codex significantly in understanding
both how the project works and how it is supposed to be used.
