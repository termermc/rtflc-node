import type { Scope } from "../runtime/Scope";
import type { RuntimeException } from "../runtime/RuntimeException";

export abstract class RtflType {
  abstract name(): string;
  abstract value(): unknown;
  abstract equals(value: RtflType, scope: Scope): boolean;

  toString(): string {
    const val = this.value();
    return val === null || val === undefined ? "null" : String(val);
  }

  static fromJsValue(value: unknown): RtflType {
    if (value === null || value === undefined) {
      return new NullType();
    }

    if (typeof value === "boolean") {
      return new BoolType(value);
    }

    if (typeof value === "number") {
      if (Number.isInteger(value)) {
        return new IntType(value);
      }
      return new DoubleType(value);
    }

    if (typeof value === "string") {
      return new StringType(value);
    }

    if (Array.isArray(value)) {
      return new ArrayType(value.map((item) => RtflType.fromJsValue(item)));
    }

    if (value instanceof Map) {
      const map = new Map<string, RtflType>();
      for (const [key, entry] of value.entries()) {
        map.set(String(key), RtflType.fromJsValue(entry));
      }
      return new MapType(map);
    }

    return new JavaObjectWrapperType(value);
  }

  static toJsValue(value: RtflType): unknown {
    if (value instanceof ArrayType) {
      return value.items().map((item) => RtflType.toJsValue(item));
    }

    if (value instanceof MapType) {
      const obj: Record<string, unknown> = {};
      for (const [key, entry] of value.entries()) {
        obj[key] = RtflType.toJsValue(entry);
      }
      return obj;
    }

    return value.value();
  }
}

export abstract class NumberType extends RtflType {
  abstract toInt(): number;
  abstract toDouble(): number;
}

export abstract class AssignmentType extends RtflType {
  abstract extractValue(scope: Scope): RtflType;
}

export class NullType extends RtflType {
  name(): string {
    return "NULL";
  }

  value(): null {
    return null;
  }

  equals(value: RtflType, scope: Scope): boolean {
    const val = value instanceof AssignmentType ? value.extractValue(scope) : value;
    return val instanceof NullType;
  }

  toString(): string {
    return "null";
  }
}

export class BoolType extends NumberType {
  private readonly val: boolean;

  constructor(value: boolean) {
    super();
    this.val = value;
  }

  name(): string {
    return "BOOL";
  }

  value(): boolean {
    return this.val;
  }

  toInt(): number {
    return this.val ? 1 : 0;
  }

  toDouble(): number {
    return this.val ? 1 : 0;
  }

  equals(value: RtflType, scope: Scope): boolean {
    const val = value instanceof AssignmentType ? value.extractValue(scope) : value;
    if (val instanceof NumberType) {
      return val.toDouble() === this.toDouble();
    }
    return false;
  }

  toString(): string {
    return this.val ? "true" : "false";
  }
}

export class IntType extends NumberType {
  private readonly val: number;

  constructor(value: number) {
    super();
    this.val = value;
  }

  name(): string {
    return "INT";
  }

  value(): number {
    return this.val;
  }

  toInt(): number {
    return Math.trunc(this.val);
  }

  toDouble(): number {
    return this.val;
  }

  equals(value: RtflType, scope: Scope): boolean {
    const val = value instanceof AssignmentType ? value.extractValue(scope) : value;
    if (val instanceof NumberType) {
      return val.toDouble() === this.toDouble();
    }
    return false;
  }

  toString(): string {
    return String(this.val);
  }
}

export class DoubleType extends NumberType {
  private readonly val: number;

  constructor(value: number) {
    super();
    this.val = value;
  }

  name(): string {
    return "DOUBLE";
  }

  value(): number {
    return this.val;
  }

  toInt(): number {
    return Math.trunc(this.val);
  }

  toDouble(): number {
    return this.val;
  }

  equals(value: RtflType, scope: Scope): boolean {
    const val = value instanceof AssignmentType ? value.extractValue(scope) : value;
    if (val instanceof NumberType) {
      return val.toDouble() === this.toDouble();
    }
    return false;
  }

  toString(): string {
    return String(this.val);
  }
}

export class StringType extends RtflType {
  private readonly val: string;

  constructor(value: string) {
    super();
    this.val = value;
  }

  name(): string {
    return "STRING";
  }

  value(): string {
    return this.val;
  }

  equals(value: RtflType, scope: Scope): boolean {
    const val = value instanceof AssignmentType ? value.extractValue(scope) : value;
    return val instanceof StringType && val.value() === this.val;
  }

  toString(): string {
    return `"${this.val}"`;
  }
}

export class ArrayType extends RtflType {
  private readonly arr: RtflType[];

  constructor(values: RtflType[] = []) {
    super();
    this.arr = [...values];
  }

  name(): string {
    return "ARRAY";
  }

  value(): RtflType[] {
    return this.arr;
  }

  items(): RtflType[] {
    return this.arr;
  }

  equals(value: RtflType, scope: Scope): boolean {
    const val = value instanceof AssignmentType ? value.extractValue(scope) : value;
    if (val instanceof ArrayType) {
      const other = val.items();
      if (other.length !== this.arr.length) {
        return false;
      }

      for (let i = 0; i < this.arr.length; i += 1) {
        if (!other[i].equals(this.arr[i], scope)) {
          return false;
        }
      }

      return true;
    }

    return false;
  }

  toString(): string {
    return `[${this.arr.map((item) => item.toString()).join(", ")}]`;
  }
}

export class MapType extends RtflType {
  private readonly map: Map<string, RtflType>;

  constructor(values: Map<string, RtflType> = new Map()) {
    super();
    this.map = new Map(values);
  }

  name(): string {
    return "MAP";
  }

  value(): Map<string, RtflType> {
    return this.map;
  }

  entries(): Map<string, RtflType> {
    return this.map;
  }

  equals(_value: RtflType, _scope: Scope): boolean {
    return false;
  }

  toString(): string {
    const entries = Array.from(this.map.entries()).map(([key, val]) => `${key}=${val}`);
    return `{${entries.join(", ")}}`;
  }
}

export class JavaObjectWrapperType extends RtflType {
  private readonly val: unknown;

  constructor(value: unknown) {
    super();
    this.val = value;
  }

  name(): string {
    return "JAVA";
  }

  value(): unknown {
    return this.val;
  }

  equals(value: RtflType, scope: Scope): boolean {
    if (value instanceof AssignmentType) {
      return value.extractValue(scope).value() === this.val;
    }
    return value.value() === this.val;
  }

  toString(): string {
    return this.val === null || this.val === undefined ? "null" : String(this.val);
  }
}

export type RtflRuntimeError = RuntimeException;
