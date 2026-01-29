import assert from "assert";
import path from "path";
import { RtflRuntime } from "../src/runtime/RtflRuntime";

function runProgram(fileName: string): string {
  let output = "";
  const runtime = new RtflRuntime({
    output: (text: string) => {
      output += text;
    },
  }).importStandard();

  const programPath = path.resolve(__dirname, "../../tests/programs", fileName);
  runtime.executeFile(programPath);
  return output;
}

const cases: Array<{ file: string; expected: string }> = [
  { file: "basic.rtfl", expected: "hello\n5\n" },
  { file: "control.rtfl", expected: "0\n1\n2\n" },
  { file: "functions.rtfl", expected: "10\n" },
  { file: "collections.rtfl", expected: "3\n4\nvalue\n" },
  {
    file: "design_basics.rtfl",
    expected: "3\nundef-ok\nnull-ok\nvoid-ok\nflag-ok\n7\n7\n5\nscope-ok\ntemp\nunfunc-ok\n",
  },
  {
    file: "logic_and_while.rtfl",
    expected: "0\n1\n2\nequal-ok\ngreater-ok\nless-ok\nand-ok\nor-ok\nnot-ok\n",
  },
  {
    file: "strings_methods.rtfl",
    expected: "abcd\n4\n3\nends-ok\nmethod-logic-ok\naXYd\nbc\nc\nline1\nline2\n",
  },
  { file: "arrays_maps.rtfl", expected: "9\n3\nbar\nqux\n" },
  { file: "error_handling.rtfl", expected: "boom\n" },
];

for (const testCase of cases) {
  assert.strictEqual(runProgram(testCase.file), testCase.expected, `Mismatch for ${testCase.file}`);
}

process.stdout.write("All Rtfl runtime tests passed.\n");
