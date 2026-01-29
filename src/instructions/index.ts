import type { RtflType } from "../types";

export interface RtflInstruction {
  originFile(): string;
  originLine(): number;
}

export interface ClauseOpenerInstruction extends RtflInstruction {}

export class VarDefInstruction implements RtflInstruction {
  private readonly file: string;
  private readonly line: number;
  private readonly name: string;
  private readonly value: RtflType;

  constructor(file: string, line: number, name: string, value: RtflType) {
    this.file = file;
    this.line = line;
    this.name = name;
    this.value = value;
  }

  originFile(): string {
    return this.file;
  }

  originLine(): number {
    return this.line;
  }

  variableName(): string {
    return this.name;
  }

  variableValue(): RtflType {
    return this.value;
  }

  toString(): string {
    return `def ${this.name} = ${this.value}`;
  }
}

export class VarLocalDefInstruction implements RtflInstruction {
  private readonly file: string;
  private readonly line: number;
  private readonly name: string;
  private readonly value: RtflType;

  constructor(file: string, line: number, name: string, value: RtflType) {
    this.file = file;
    this.line = line;
    this.name = name;
    this.value = value;
  }

  originFile(): string {
    return this.file;
  }

  originLine(): number {
    return this.line;
  }

  variableName(): string {
    return this.name;
  }

  variableValue(): RtflType {
    return this.value;
  }

  toString(): string {
    return `local ${this.name} = ${this.value}`;
  }
}

export class VarAssignInstruction implements RtflInstruction {
  private readonly file: string;
  private readonly line: number;
  private readonly name: string;
  private readonly value: RtflType;

  constructor(file: string, line: number, name: string, value: RtflType) {
    this.file = file;
    this.line = line;
    this.name = name;
    this.value = value;
  }

  originFile(): string {
    return this.file;
  }

  originLine(): number {
    return this.line;
  }

  variableName(): string {
    return this.name;
  }

  assignValue(): RtflType {
    return this.value;
  }

  toString(): string {
    return `${this.name} = ${this.value}`;
  }
}

export class ArrayAssignInstruction implements RtflInstruction {
  private readonly file: string;
  private readonly line: number;
  private readonly arrayValue: RtflType;
  private readonly indexValue: RtflType;
  private readonly assignment: RtflType;

  constructor(file: string, line: number, arrayValue: RtflType, indexValue: RtflType, assignment: RtflType) {
    this.file = file;
    this.line = line;
    this.arrayValue = arrayValue;
    this.indexValue = indexValue;
    this.assignment = assignment;
  }

  originFile(): string {
    return this.file;
  }

  originLine(): number {
    return this.line;
  }

  array(): RtflType {
    return this.arrayValue;
  }

  index(): RtflType {
    return this.indexValue;
  }

  assignValue(): RtflType {
    return this.assignment;
  }

  toString(): string {
    return `${this.arrayValue}[${this.indexValue}] = ${this.assignment}`;
  }
}

export class MapAssignInstruction implements RtflInstruction {
  private readonly file: string;
  private readonly line: number;
  private readonly mapValue: RtflType;
  private readonly fieldValue: string;
  private readonly assignment: RtflType;

  constructor(file: string, line: number, mapValue: RtflType, fieldValue: string, assignment: RtflType) {
    this.file = file;
    this.line = line;
    this.mapValue = mapValue;
    this.fieldValue = fieldValue;
    this.assignment = assignment;
  }

  originFile(): string {
    return this.file;
  }

  originLine(): number {
    return this.line;
  }

  map(): RtflType {
    return this.mapValue;
  }

  field(): string {
    return this.fieldValue;
  }

  assignValue(): RtflType {
    return this.assignment;
  }

  toString(): string {
    return `${this.mapValue}->${this.fieldValue} = ${this.assignment}`;
  }
}

export class VarUndefInstruction implements RtflInstruction {
  private readonly file: string;
  private readonly line: number;
  private readonly name: string;

  constructor(file: string, line: number, name: string) {
    this.file = file;
    this.line = line;
    this.name = name;
  }

  originFile(): string {
    return this.file;
  }

  originLine(): number {
    return this.line;
  }

  variableName(): string {
    return this.name;
  }

  toString(): string {
    return `undef ${this.name}`;
  }
}

export class FuncCallInstruction implements RtflInstruction {
  private readonly file: string;
  private readonly line: number;
  private readonly name: string;
  private readonly args: RtflType[];

  constructor(file: string, line: number, name: string, args: RtflType[]) {
    this.file = file;
    this.line = line;
    this.name = name;
    this.args = args;
  }

  originFile(): string {
    return this.file;
  }

  originLine(): number {
    return this.line;
  }

  functionName(): string {
    return this.name;
  }

  functionArguments(): RtflType[] {
    return this.args;
  }

  toString(): string {
    return `${this.name}(${this.args.join(", ")})`;
  }
}

export class ReturnInstruction implements RtflInstruction {
  private readonly file: string;
  private readonly line: number;
  private readonly value: RtflType;

  constructor(file: string, line: number, value: RtflType) {
    this.file = file;
    this.line = line;
    this.value = value;
  }

  originFile(): string {
    return this.file;
  }

  originLine(): number {
    return this.line;
  }

  returnValue(): RtflType {
    return this.value;
  }

  toString(): string {
    return `return ${this.value}`;
  }
}

export class IfInstruction implements ClauseOpenerInstruction {
  private readonly file: string;
  private readonly line: number;
  private readonly value: RtflType;

  constructor(file: string, line: number, value: RtflType) {
    this.file = file;
    this.line = line;
    this.value = value;
  }

  originFile(): string {
    return this.file;
  }

  originLine(): number {
    return this.line;
  }

  condition(): RtflType {
    return this.value;
  }

  toString(): string {
    return `if ${this.value} {`;
  }
}

export class WhileInstruction implements ClauseOpenerInstruction {
  private readonly file: string;
  private readonly line: number;
  private readonly value: RtflType;

  constructor(file: string, line: number, value: RtflType) {
    this.file = file;
    this.line = line;
    this.value = value;
  }

  originFile(): string {
    return this.file;
  }

  originLine(): number {
    return this.line;
  }

  condition(): RtflType {
    return this.value;
  }

  toString(): string {
    return `while ${this.value} {`;
  }
}

export class TryInstruction implements ClauseOpenerInstruction {
  private readonly file: string;
  private readonly line: number;
  private readonly name: string;

  constructor(file: string, line: number, name: string) {
    this.file = file;
    this.line = line;
    this.name = name;
  }

  originFile(): string {
    return this.file;
  }

  originLine(): number {
    return this.line;
  }

  variableName(): string {
    return this.name;
  }

  toString(): string {
    return `error ${this.name} {`;
  }
}

export class EndClauseInstruction implements RtflInstruction {
  private readonly file: string;
  private readonly line: number;

  constructor(file: string, line: number) {
    this.file = file;
    this.line = line;
  }

  originFile(): string {
    return this.file;
  }

  originLine(): number {
    return this.line;
  }

  toString(): string {
    return "}";
  }
}

export class FuncDefInstruction implements ClauseOpenerInstruction {
  private readonly file: string;
  private readonly line: number;
  private readonly name: string;
  private readonly argNames: string[];

  constructor(file: string, line: number, name: string, argNames: string[] = []) {
    this.file = file;
    this.line = line;
    this.name = name;
    this.argNames = argNames;
  }

  originFile(): string {
    return this.file;
  }

  originLine(): number {
    return this.line;
  }

  functionName(): string {
    return this.name;
  }

  argumentNames(): string[] {
    return this.argNames;
  }

  toString(): string {
    if (this.argNames.length === 0) {
      return `func ${this.name} {`;
    }

    return `func ${this.name}(${this.argNames.join(", ")}) {`;
  }
}

export class FuncUndefInstruction implements RtflInstruction {
  private readonly file: string;
  private readonly line: number;
  private readonly name: string;

  constructor(file: string, line: number, name: string) {
    this.file = file;
    this.line = line;
    this.name = name;
  }

  originFile(): string {
    return this.file;
  }

  originLine(): number {
    return this.line;
  }

  functionName(): string {
    return this.name;
  }

  toString(): string {
    return `unfunc ${this.name}`;
  }
}

export class AsyncInstruction implements ClauseOpenerInstruction {
  private readonly file: string;
  private readonly line: number;

  constructor(file: string, line: number) {
    this.file = file;
    this.line = line;
  }

  originFile(): string {
    return this.file;
  }

  originLine(): number {
    return this.line;
  }

  toString(): string {
    return "async {";
  }
}

export class DescendScopeInstruction implements RtflInstruction {
  originFile(): string {
    return "null";
  }

  originLine(): number {
    return 0;
  }
}

export class AscendScopeInstruction implements RtflInstruction {
  originFile(): string {
    return "null";
  }

  originLine(): number {
    return 0;
  }
}
