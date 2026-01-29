import type { InstructionConsumer } from "./InstructionConsumer";
import type { RtflInstruction } from "../instructions";
import {
  ArrayAssignInstruction,
  AscendScopeInstruction,
  DescendScopeInstruction,
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
  AsyncInstruction,
} from "../instructions";
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
import { CompilerException } from "../compiler/CompilerException";
import { ByteWriter } from "../utils/ByteIO";

export class CompilerInstructionConsumer implements InstructionConsumer {
  private readonly out: ByteWriter;
  private readonly writeLines: boolean;

  constructor(output: ByteWriter, writeLines: boolean) {
    this.out = output;
    this.writeLines = writeLines;
  }

  consume(inst: RtflInstruction): void {
    if (this.writeLines) {
      this.writeShort(inst.originLine());
    }

    if (inst instanceof VarDefInstruction) {
      this.out.writeByte(0);
      this.out.writeByte(inst.variableName().length);
      this.writeStr(inst.variableName());
      this.writeVal(inst.variableValue());
    } else if (inst instanceof VarLocalDefInstruction) {
      this.out.writeByte(1);
      this.out.writeByte(inst.variableName().length);
      this.writeStr(inst.variableName());
      this.writeVal(inst.variableValue());
    } else if (inst instanceof VarAssignInstruction) {
      this.out.writeByte(2);
      this.out.writeByte(inst.variableName().length);
      this.writeStr(inst.variableName());
      this.writeVal(inst.assignValue());
    } else if (inst instanceof VarUndefInstruction) {
      this.out.writeByte(3);
      this.out.writeByte(inst.variableName().length);
      this.writeStr(inst.variableName());
    } else if (inst instanceof FuncCallInstruction) {
      this.out.writeByte(4);
      this.out.writeByte(inst.functionName().length);
      this.writeStr(inst.functionName());
      this.out.writeByte(inst.functionArguments().length);
      for (const arg of inst.functionArguments()) {
        this.writeVal(arg);
      }
    } else if (inst instanceof ReturnInstruction) {
      this.out.writeByte(5);
      this.writeVal(inst.returnValue());
    } else if (inst instanceof IfInstruction) {
      this.out.writeByte(6);
      const cond = inst.condition();
      if (cond instanceof NumberType || cond instanceof AssignmentType) {
        this.writeVal(cond);
      } else {
        throw new CompilerException("Non-number/bool value provided for 'if' instruction");
      }
    } else if (inst instanceof WhileInstruction) {
      this.out.writeByte(7);
      const cond = inst.condition();
      if (cond instanceof NumberType || cond instanceof AssignmentType) {
        this.writeVal(cond);
      } else {
        throw new CompilerException("Non-number/bool value provided for 'while' instruction");
      }
    } else if (inst instanceof TryInstruction) {
      this.out.writeByte(8);
      this.out.writeByte(inst.variableName().length);
      this.writeStr(inst.variableName());
    } else if (inst instanceof EndClauseInstruction) {
      this.out.writeByte(9);
    } else if (inst instanceof FuncDefInstruction) {
      this.out.writeByte(10);
      this.out.writeByte(inst.functionName().length);
      this.writeStr(inst.functionName());
      this.out.writeByte(inst.argumentNames().length);
      for (const name of inst.argumentNames()) {
        this.out.writeByte(name.length);
        this.writeStr(name);
      }
    } else if (inst instanceof FuncUndefInstruction) {
      this.out.writeByte(11);
      this.out.writeByte(inst.functionName().length);
      this.writeStr(inst.functionName());
    } else if (inst instanceof AsyncInstruction) {
      this.out.writeByte(12);
    } else if (inst instanceof DescendScopeInstruction) {
      this.out.writeByte(14);
    } else if (inst instanceof AscendScopeInstruction) {
      this.out.writeByte(15);
    } else if (inst instanceof ArrayAssignInstruction) {
      this.out.writeByte(16);
      this.writeVal(inst.array());
      this.writeVal(inst.index());
      this.writeVal(inst.assignValue());
    } else if (inst instanceof MapAssignInstruction) {
      this.out.writeByte(17);
      this.writeVal(inst.map());
      this.out.writeByte(inst.field().length);
      this.writeStr(inst.field());
      this.writeVal(inst.assignValue());
    }
  }

  finish(): void {}

  private writeShort(value: number): void {
    this.out.writeShort(value);
  }

  private writeInt(value: number): void {
    this.out.writeInt(value);
  }

  private writeDouble(value: number): void {
    this.out.writeDouble(value);
  }

  private writeStr(value: string): void {
    this.out.writeString(value);
  }

  private writeVal(val: RtflType): void {
    if (val instanceof NullType) {
      this.out.writeByte(0);
    } else if (val instanceof BoolType) {
      this.out.writeByte(1);
      this.out.writeByte(val.toInt());
    } else if (val instanceof IntType) {
      this.out.writeByte(2);
      this.writeInt(val.toInt());
    } else if (val instanceof DoubleType) {
      this.out.writeByte(3);
      this.writeDouble(val.toDouble());
    } else if (val instanceof StringType) {
      const str = val.value();
      if (str.length > 256) {
        this.out.writeByte(5);
        this.writeShort(str.length);
        this.writeStr(str);
      } else {
        this.out.writeByte(4);
        this.out.writeByte(str.length);
        this.writeStr(str);
      }
    } else if (val instanceof FunctionCallAssignment) {
      this.out.writeByte(6);
      this.out.writeByte(val.functionName().length);
      this.writeStr(val.functionName());
      this.out.writeByte(val.functionArgs().length);
      for (const arg of val.functionArgs()) {
        this.writeVal(arg);
      }
    } else if (val instanceof VarRefAssignment) {
      this.out.writeByte(7);
      this.out.writeByte(val.variableName().length);
      this.writeStr(val.variableName());
    } else if (val instanceof LogicAssignment) {
      this.out.writeByte(8);
      this.out.writeByte(val.comparisonType());
      this.out.writeByte(val.inverse() ? 1 : 0);
      this.writeVal(val.firstValue());
      this.writeVal(val.secondValue());
    } else if (val instanceof NotAssignment) {
      this.out.writeByte(9);
      this.writeVal(val.originalValue());
    } else if (val instanceof ArrayIndexAssignment) {
      this.out.writeByte(10);
      this.writeVal(val.array());
      this.writeVal(val.index());
    } else if (val instanceof MapFieldAssignment) {
      this.out.writeByte(11);
      this.writeVal(val.map());
      this.out.writeByte(val.field().length);
      this.writeStr(val.field());
    } else {
      throw new CompilerException(`Failed to write unknown value type ${val.constructor.name}`);
    }
  }
}
