import type { Scope } from "../../runtime/Scope";
import { RuntimeException } from "../../runtime/RuntimeException";
import { LogicComparison } from "../../utils/LogicComparison";
import {
  ArrayType,
  AssignmentType,
  BoolType,
  MapType,
  NullType,
  NumberType,
  RtflType,
  StringType,
} from "../index";

export class FunctionCallAssignment extends AssignmentType {
  private readonly funcName: string;
  private readonly funcArgs: RtflType[];

  constructor(name: string, args: RtflType[]) {
    super();
    this.funcName = name;
    this.funcArgs = args;
  }

  name(): string {
    return "FUNC_CALL";
  }

  value(): null {
    return null;
  }

  functionName(): string {
    return this.funcName;
  }

  functionArgs(): RtflType[] {
    return this.funcArgs;
  }

  toString(): string {
    return `${this.funcName}(${this.funcArgs.join(", ")})`;
  }

  equals(val: RtflType, scope: Scope): boolean {
    return this.extractValue(scope).equals(val, scope);
  }

  extractValue(scope: Scope): RtflType {
    const args = this.funcArgs.map((arg) => (arg instanceof AssignmentType ? arg.extractValue(scope) : arg));
    return scope.function(this.funcName).run(args, scope.runtime(), scope.descend(null));
  }
}

export class VarRefAssignment extends AssignmentType {
  private readonly varName: string;

  constructor(name: string) {
    super();
    this.varName = name;
  }

  name(): string {
    return "VAR_REF";
  }

  value(): null {
    return null;
  }

  variableName(): string {
    return this.varName;
  }

  toString(): string {
    return this.varName;
  }

  equals(val: RtflType, scope: Scope): boolean {
    return this.extractValue(scope).equals(val, scope);
  }

  extractValue(scope: Scope): RtflType {
    return scope.varValue(this.varName);
  }
}

export class LogicAssignment extends AssignmentType {
  private readonly left: RtflType;
  private readonly comp: LogicComparison;
  private readonly right: RtflType;
  private readonly inverseValue: boolean;

  constructor(left: RtflType, comp: LogicComparison, right: RtflType, inverse: boolean) {
    super();
    this.left = left;
    this.comp = comp;
    this.right = right;
    this.inverseValue = inverse;
  }

  name(): string {
    return "LOGIC";
  }

  value(): null {
    return null;
  }

  firstValue(): RtflType {
    return this.left;
  }

  secondValue(): RtflType {
    return this.right;
  }

  comparisonType(): LogicComparison {
    return this.comp;
  }

  inverse(): boolean {
    return this.inverseValue;
  }

  toString(): string {
    return `${this.inverseValue ? "!" : ""}[${this.left} ${LogicComparison.toChar(this.comp)} ${this.right}]`;
  }

  equals(val: RtflType, scope: Scope): boolean {
    return this.extractValue(scope).equals(val, scope);
  }

  extractValue(scope: Scope): RtflType {
    const l = this.left instanceof AssignmentType ? this.left.extractValue(scope) : this.left;
    const r = this.right instanceof AssignmentType ? this.right.extractValue(scope) : this.right;

    let value = false;

    if (this.comp === LogicComparison.EQUAL) {
      value = l.equals(r, scope);
    } else if (this.comp === LogicComparison.AND) {
      if (l instanceof NumberType && r instanceof NumberType) {
        value = l.toDouble() > 0 && r.toDouble() > 0;
      }
    } else if (this.comp === LogicComparison.OR) {
      if (l instanceof NumberType && r instanceof NumberType) {
        value = l.toDouble() > 0 || r.toDouble() > 0;
      }
    } else if (this.comp === LogicComparison.GREATER) {
      if (l instanceof NumberType && r instanceof NumberType) {
        value = l.toDouble() > r.toDouble();
      }
    } else if (this.comp === LogicComparison.LESS) {
      if (l instanceof NumberType && r instanceof NumberType) {
        value = l.toDouble() < r.toDouble();
      }
    }

    return this.inverseValue ? new BoolType(!value) : new BoolType(value);
  }
}

export class NotAssignment extends AssignmentType {
  private readonly val: RtflType;

  constructor(value: RtflType) {
    super();
    this.val = value;
  }

  name(): string {
    return "LOGIC";
  }

  value(): null {
    return null;
  }

  originalValue(): RtflType {
    return this.val;
  }

  equals(value: RtflType, scope: Scope): boolean {
    return this.extractValue(scope).equals(value, scope);
  }

  extractValue(scope: Scope): RtflType {
    let result = this.val;
    if (result instanceof AssignmentType) {
      result = result.extractValue(scope);
    }

    if (result instanceof NumberType) {
      return new BoolType(!(result.toDouble() > 0));
    }

    return new BoolType(true);
  }
}

export class ArrayIndexAssignment extends AssignmentType {
  private readonly arrayValue: RtflType;
  private readonly indexValue: RtflType;

  constructor(arrayValue: RtflType, indexValue: RtflType) {
    super();
    this.arrayValue = arrayValue;
    this.indexValue = indexValue;
  }

  name(): string {
    return "ARRAY_INDEX";
  }

  value(): null {
    return null;
  }

  array(): RtflType {
    return this.arrayValue;
  }

  index(): RtflType {
    return this.indexValue;
  }

  equals(value: RtflType, scope: Scope): boolean {
    return this.extractValue(scope).equals(value, scope);
  }

  extractValue(scope: Scope): RtflType {
    const arr = this.arrayValue instanceof AssignmentType ? this.arrayValue.extractValue(scope) : this.arrayValue;
    const idx = this.indexValue instanceof AssignmentType ? this.indexValue.extractValue(scope) : this.indexValue;

    if (!(arr instanceof ArrayType)) {
      throw new RuntimeException("Cannot get array element from non-array value");
    }

    if (!(idx instanceof NumberType)) {
      throw new RuntimeException("Cannot select element at non-number index");
    }

    const index = idx.toInt();
    const items = arr.items();
    if (index < 0 || index >= items.length) {
      throw new RuntimeException(`Index ${index} is out of bounds`);
    }

    return items[index];
  }

  toString(): string {
    return `${this.arrayValue}[${this.indexValue}]`;
  }
}

export class MapFieldAssignment extends AssignmentType {
  private readonly mapValue: RtflType;
  private readonly fieldValue: string;

  constructor(mapValue: RtflType, fieldValue: string) {
    super();
    this.mapValue = mapValue;
    this.fieldValue = fieldValue;
  }

  name(): string {
    return "MAP_FIELD";
  }

  value(): null {
    return null;
  }

  map(): RtflType {
    return this.mapValue;
  }

  field(): string {
    return this.fieldValue;
  }

  equals(value: RtflType, scope: Scope): boolean {
    return this.extractValue(scope).equals(value, scope);
  }

  extractValue(scope: Scope): RtflType {
    const map = this.mapValue instanceof AssignmentType ? this.mapValue.extractValue(scope) : this.mapValue;

    if (!(map instanceof MapType)) {
      throw new RuntimeException("Cannot get field of non-map value");
    }

    const value = map.entries().get(this.fieldValue);
    return value ?? new NullType();
  }

  toString(): string {
    return `${this.mapValue}->${this.fieldValue}`;
  }
}

export function resolveAssignmentString(value: RtflType, scope: Scope): string {
  const resolved = value instanceof AssignmentType ? value.extractValue(scope) : value;
  if (resolved instanceof StringType) {
    return resolved.value();
  }
  throw new RuntimeException("Provided non-string argument");
}
