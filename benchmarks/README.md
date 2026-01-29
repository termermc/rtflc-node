# Benchmarks

Simple Rtfl programs for comparing the TypeScript runtime with the Java runtime.
Adjust the `n` values to scale workload intensity.

Files:
- arith_loop.rtfl: tight arithmetic loop and sum
- function_calls.rtfl: function call overhead in loop
- array_ops.rtfl: array growth + indexed reads
- map_ops.rtfl: map insert/get with string keys
- string_concat.rtfl: string concatenation and length
- fib_recursive.rtfl: recursion-heavy workload

Example run:
node dist/src/cli.js benchmarks/arith_loop.rtfl
