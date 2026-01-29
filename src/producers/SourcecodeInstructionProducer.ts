import {
  ArrayAssignInstruction,
  AsyncInstruction,
  EndClauseInstruction,
  FuncCallInstruction,
  FuncDefInstruction,
  FuncUndefInstruction,
  IfInstruction,
  MapAssignInstruction,
  ReturnInstruction,
  TryInstruction,
  VarAssignInstruction,
  VarDefInstruction,
  VarLocalDefInstruction,
  VarUndefInstruction,
  WhileInstruction,
} from "../instructions";
import type { InstructionConsumer } from "../consumers/InstructionConsumer";
import { ProducerException } from "./ProducerException";
import {
  BoolType,
  DoubleType,
  IntType,
  NullType,
  NumberType,
  RtflType,
  StringType,
} from "../types";
import {
  ArrayIndexAssignment,
  FunctionCallAssignment,
  LogicAssignment,
  MapFieldAssignment,
  NotAssignment,
  VarRefAssignment,
} from "../types/assignment";
import { AssignmentType } from "../types";
import { LogicComparison } from "../utils/LogicComparison";

const patGlobalVarDef = /^def[ ]*([a-zA-Z0-9_-]*)[ ]*=[ ]*(.*)$/;
const patLocalVarDef = /^local[ ]*([a-zA-Z0-9_-]*)[ ]*=[ ]*(.*)$/;
const patVarAssignment = /^([a-zA-Z0-9_-]*)[ ]*=[ ]*(.*)$/;
const patVarUndef = /^undef[ ]*([a-zA-Z0-9_-]*)$/;
const patFuncCall = /^([a-zA-Z0-9_-]*)\((.*)\)$/;
const patMethodCall = /^(.+)\.([a-zA-Z0-9_-]+)(\((.*)\))?$/;
const patReturn = /^return (.*)$/;
const patIf = /^if (.+)[ ]*\{$/;
const patWhile = /^while (.+)[ ]*\{$/;
const patTry = /^error ([a-zA-Z0-9_-]*)[ ]*\{$/;
const patFuncDef = /^func ([a-zA-Z0-9_-]*)[ ]*\{$/;
const patFuncUndef = /^unfunc[ ]*([a-zA-Z0-9_-]*)$/;
const patAsync = /^async[ ]*\{$/;
const patArrayAssignment = /^(.+)[ ]*\[[ ]*(.+)[ ]*\][ ]*=[ ]*(.+)$/;
const patMapFieldAssignment = /^(.+)->([a-zA-Z0-9_-]+)[ ]*=[ ]*(.+)$/;
const patFuncDefArgs = /^func[ ]+([a-zA-Z0-9_-]*)\([ ]*(.*)[ ]*\)[ ]*\{$/;

const patNumber = /^(-?[0-9]*[\.]?[0-9]*)?$/;
const patString = /^"(.*)"$/;
const patVar = /^([a-zA-Z0-9_.-]*)$/;
const patLogic = /^\!?\[[ ]*(.+)[ ]*(=|&|\||>|<)[ ]*(.+)[ ]*\]$/;
const patSimpleLogic = /^\!?\[[ ]*(.+)[ ]*\]$/;
const patArrayIndex = /(.+)[ ]*\[[ ]*(.+)[ ]*\]/;
const patMapField = /(.+)->([a-zA-Z0-9_-]+)/;

export class SourcecodeInstructionProducer {
  static produce(src: string, code: string, consumer: InstructionConsumer): void {
    const lines = code.split(/\r?\n/);
    let lnNum = 0;

    for (const rawLine of lines) {
      let line = rawLine.trim();
      lnNum += 1;

      if (line.endsWith(";")) {
        line = line.slice(0, -1);
      }

      if (line.length === 0 || line.startsWith("//") || line.startsWith("#")) {
        continue;
      }

      let match: RegExpMatchArray | null = null;

      if ((match = line.match(patGlobalVarDef))) {
        consumer.consume(new VarDefInstruction(src, lnNum, match[1], this.resolveValue(src, lnNum, match[2])));
      } else if ((match = line.match(patLocalVarDef))) {
        consumer.consume(new VarLocalDefInstruction(src, lnNum, match[1], this.resolveValue(src, lnNum, match[2])));
      } else if ((match = line.match(patArrayAssignment))) {
        const arr = this.resolveValue(src, lnNum, match[1]);
        const idx = this.resolveValue(src, lnNum, match[2]);
        const val = this.resolveValue(src, lnNum, match[3]);

        if (!(idx instanceof AssignmentType || idx instanceof NumberType)) {
          throw new ProducerException("Non-number/bool value provided for logic expression", src, lnNum);
        }

        consumer.consume(new ArrayAssignInstruction(src, lnNum, arr, idx, val));
      } else if ((match = line.match(patMapFieldAssignment))) {
        const map = this.resolveValue(src, lnNum, match[1]);
        const field = match[2];
        const value = this.resolveValue(src, lnNum, match[3]);

        consumer.consume(new MapAssignInstruction(src, lnNum, map, field, value));
      } else if ((match = line.match(patVarAssignment))) {
        consumer.consume(new VarAssignInstruction(src, lnNum, match[1], this.resolveValue(src, lnNum, match[2])));
      } else if ((match = line.match(patVarUndef))) {
        consumer.consume(new VarUndefInstruction(src, lnNum, match[1]));
      } else if ((match = line.match(patReturn))) {
        consumer.consume(new ReturnInstruction(src, lnNum, this.resolveValue(src, lnNum, match[1])));
      } else if ((match = line.match(patFuncCall))) {
        const funcName = match[1];
        const args = this.parseFuncArgs(src, lnNum, match[2].trim());
        consumer.consume(new FuncCallInstruction(src, lnNum, funcName, args));
      } else if ((match = line.match(patMethodCall))) {
        const exp = this.resolveValue(src, lnNum, match[1]);
        const funcName = match[2];
        const args: RtflType[] = [exp];
        if (match[4]) {
          args.push(...this.parseFuncArgs(src, lnNum, match[4]));
        }
        consumer.consume(new FuncCallInstruction(src, lnNum, funcName, args));
      } else if ((match = line.match(patIf))) {
        const cond = this.resolveValue(src, lnNum, match[1]);
        if (cond instanceof AssignmentType || cond instanceof NumberType) {
          consumer.consume(new IfInstruction(src, lnNum, cond));
        } else {
          throw new ProducerException("Non-number/bool value provided for 'if' instruction", src, lnNum);
        }
      } else if ((match = line.match(patWhile))) {
        const cond = this.resolveValue(src, lnNum, match[1]);
        if (cond instanceof AssignmentType || cond instanceof NumberType) {
          consumer.consume(new WhileInstruction(src, lnNum, cond));
        } else {
          throw new ProducerException("Non-number/bool value provided for 'while' instruction", src, lnNum);
        }
      } else if ((match = line.match(patTry))) {
        consumer.consume(new TryInstruction(src, lnNum, match[1]));
      } else if ((match = line.match(patFuncDef))) {
        consumer.consume(new FuncDefInstruction(src, lnNum, match[1]));
      } else if ((match = line.match(patFuncDefArgs))) {
        const rawNames = match[2].split(",");
        const names: string[] = [];
        for (const name of rawNames) {
          if (patVar.test(name.trim())) {
            names.push(name.trim());
          } else {
            throw new ProducerException("Argument name cannot contain special characters", src, lnNum);
          }
        }
        consumer.consume(new FuncDefInstruction(src, lnNum, match[1], names));
      } else if ((match = line.match(patFuncUndef))) {
        consumer.consume(new FuncUndefInstruction(src, lnNum, match[1]));
      } else if (line.match(patAsync)) {
        consumer.consume(new AsyncInstruction(src, lnNum));
      } else if (line === "}") {
        consumer.consume(new EndClauseInstruction(src, lnNum));
      } else {
        throw new ProducerException(`Encountered invalid expression: ${line}`, src, lnNum);
      }
    }

    consumer.finish();
  }

  static resolveValue(src: string, ln: number, value: string): RtflType {
    const str = value.trim();

    const lowered = str.toLowerCase();
    if (lowered === "null" || lowered === "undefined" || lowered === "void") {
      return new NullType();
    }

    if (lowered === "true") {
      return new BoolType(true);
    }

    if (lowered === "false") {
      return new BoolType(false);
    }

    let match: RegExpMatchArray | null = null;

    if ((match = str.match(patString))) {
      const raw = match[1]
        .replace(/\\\\/g, "\\")
        .replace(/\\\"/g, "\"")
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\r/g, "\r")
        .replace(/\\b/g, "\b")
        .replace(/\\f/g, "\f");
      return new StringType(raw);
    }

    if ((match = str.match(patNumber))) {
      if (str.length === 0) {
        throw new ProducerException("Encountered invalid value expression: ", src, ln);
      }
      const parsed = str.includes(".") ? Number.parseFloat(str) : Number.parseInt(str, 10);
      if (Number.isNaN(parsed)) {
        throw new ProducerException(`Encountered invalid value expression: ${str}`, src, ln);
      }
      return str.includes(".") ? new DoubleType(parsed) : new IntType(parsed);
    }

    if ((match = str.match(patFuncCall))) {
      const funcName = match[1];
      const args = this.parseFuncArgs(src, ln, match[2].trim());
      return new FunctionCallAssignment(funcName, args);
    }

    if ((match = str.match(patMethodCall))) {
      const exp = this.resolveValue(src, ln, match[1]);
      const funcName = match[2];
      const args: RtflType[] = [exp];
      if (match[4]) {
        args.push(...this.parseFuncArgs(src, ln, match[4]));
      }
      return new FunctionCallAssignment(funcName, args);
    }

    if ((match = str.match(patVar))) {
      return new VarRefAssignment(match[1]);
    }

    if ((match = str.match(patLogic))) {
      const val1 = this.resolveValue(src, ln, match[1]);
      const val2 = this.resolveValue(src, ln, match[3]);
      const comp = LogicComparison.byChar(match[2]);

      if (comp === null) {
        throw new ProducerException("Encountered invalid value expression: " + str, src, ln);
      }

      const compValue = comp as LogicComparison;
      if (
        (val1 instanceof AssignmentType || val1 instanceof NumberType) &&
        (val2 instanceof AssignmentType || val2 instanceof NumberType)
      ) {
        return new LogicAssignment(val1, compValue, val2, str.startsWith("!"));
      }

      if (compValue !== LogicComparison.EQUAL) {
        throw new ProducerException("Non-number/bool value provided for logic expression", src, ln);
      }

      return new LogicAssignment(val1, compValue, val2, str.startsWith("!"));
    }

    if ((match = str.match(patSimpleLogic))) {
      const logicVal = this.resolveValue(src, ln, match[1]);

      if (logicVal instanceof AssignmentType) {
        return str.startsWith("!") ? new NotAssignment(logicVal) : logicVal;
      }

      if (logicVal instanceof NumberType) {
        const value = logicVal.toDouble() > 0;
        return new BoolType(str.startsWith("!") ? !value : value);
      }

      throw new ProducerException("Non-number/bool value provided for logic expression", src, ln);
    }

    if ((match = str.match(patArrayIndex))) {
      const arr = this.resolveValue(src, ln, match[1]);
      const idx = this.resolveValue(src, ln, match[2]);

      if (!(idx instanceof NumberType || idx instanceof AssignmentType)) {
        throw new ProducerException("Non-number value provided as array index", src, ln);
      }

      return new ArrayIndexAssignment(arr, idx);
    }

    if ((match = str.match(patMapField))) {
      const map = this.resolveValue(src, ln, match[1]);
      const field = match[2];
      return new MapFieldAssignment(map, field);
    }

    throw new ProducerException(`Encountered invalid value expression: ${str}`, src, ln);
  }

  private static parseFuncArgs(src: string, ln: number, argStr: string): RtflType[] {
    const chars = argStr.split("");
    let openQuote = false;
    let openPars = 0;
    const args: RtflType[] = [];

    let argBuf = "";
    for (let i = 0; i < chars.length; i += 1) {
      const c = chars[i];

      if (i < 1 && c === '"') {
        openQuote = !openQuote;
      } else if (c === '"' && ((i > 0 && chars[i - 1] !== "\\") || (i > 1 && chars[i - 2] === "\\"))) {
        openQuote = !openQuote;
      } else if (c === '"' && i > 1 && chars[i - 2] === "\\") {
        openQuote = !openQuote;
      }

      if (!openQuote) {
        if (c === "(") {
          openPars += 1;
        } else if (c === ")") {
          if (openPars > -1) {
            openPars -= 1;
          }
        }
      }

      if (!openQuote && openPars < 1 && c === ",") {
        args.push(this.resolveValue(src, ln, argBuf));
        argBuf = "";
      } else {
        argBuf += c;
      }
    }

    const lastArg = argBuf.trim();
    if (lastArg.length > 0) {
      args.push(this.resolveValue(src, ln, lastArg));
    }

    return args;
  }
}
