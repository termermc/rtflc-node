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
import { ByteReader } from "../utils/ByteIO";

export class BytecodeInstructionProducer {
  static produce(src: string, buffer: Buffer, consumer: InstructionConsumer, readLines: boolean): void {
    const reader = new ByteReader(buffer);
    let currentSource = src;

    while (reader.remaining() > 0) {
      const ln = readLines ? reader.readShort() : 0;
      const opcode = reader.readByte();

      if (opcode === 13) {
        const nameLen = reader.readByte();
        const name = reader.readBytes(nameLen).toString("utf8");
        currentSource = name;
        continue;
      }

      switch (opcode) {
        case 0: {
          const nameLen = reader.readByte();
          const name = reader.readBytes(nameLen).toString("utf8");
          const value = this.resolveVal(reader, currentSource, ln);
          consumer.consume(new VarDefInstruction(currentSource, ln, name, value));
          break;
        }
        case 1: {
          const nameLen = reader.readByte();
          const name = reader.readBytes(nameLen).toString("utf8");
          const value = this.resolveVal(reader, currentSource, ln);
          consumer.consume(new VarLocalDefInstruction(currentSource, ln, name, value));
          break;
        }
        case 2: {
          const nameLen = reader.readByte();
          const name = reader.readBytes(nameLen).toString("utf8");
          const value = this.resolveVal(reader, currentSource, ln);
          consumer.consume(new VarAssignInstruction(currentSource, ln, name, value));
          break;
        }
        case 3: {
          const nameLen = reader.readByte();
          const name = reader.readBytes(nameLen).toString("utf8");
          consumer.consume(new VarUndefInstruction(currentSource, ln, name));
          break;
        }
        case 4: {
          const nameLen = reader.readByte();
          const name = reader.readBytes(nameLen).toString("utf8");
          const argLen = reader.readByte();
          const args: RtflType[] = [];
          for (let i = 0; i < argLen; i += 1) {
            args.push(this.resolveVal(reader, currentSource, ln));
          }
          consumer.consume(new FuncCallInstruction(currentSource, ln, name, args));
          break;
        }
        case 5: {
          const returnVal = this.resolveVal(reader, currentSource, ln);
          consumer.consume(new ReturnInstruction(currentSource, ln, returnVal));
          break;
        }
        case 6: {
          const condition = this.resolveVal(reader, currentSource, ln);
          if (condition instanceof NumberType || condition instanceof AssignmentType) {
            consumer.consume(new IfInstruction(currentSource, ln, condition));
          } else {
            throw new ProducerException("Non-number/bool value provided for 'if' instruction", currentSource, ln);
          }
          break;
        }
        case 7: {
          const condition = this.resolveVal(reader, currentSource, ln);
          if (condition instanceof NumberType || condition instanceof AssignmentType) {
            consumer.consume(new WhileInstruction(currentSource, ln, condition));
          } else {
            throw new ProducerException("Non-number/bool value provided for 'while' instruction", currentSource, ln);
          }
          break;
        }
        case 8: {
          const nameLen = reader.readByte();
          const name = reader.readBytes(nameLen).toString("utf8");
          consumer.consume(new TryInstruction(currentSource, ln, name));
          break;
        }
        case 9:
          consumer.consume(new EndClauseInstruction(currentSource, ln));
          break;
        case 10: {
          const nameLen = reader.readByte();
          const name = reader.readBytes(nameLen).toString("utf8");
          const argNameCount = reader.readByte();
          const argNames: string[] = [];
          for (let i = 0; i < argNameCount; i += 1) {
            const argLen = reader.readByte();
            argNames.push(reader.readBytes(argLen).toString("utf8"));
          }
          consumer.consume(new FuncDefInstruction(currentSource, ln, name, argNames));
          break;
        }
        case 11: {
          const nameLen = reader.readByte();
          const name = reader.readBytes(nameLen).toString("utf8");
          consumer.consume(new FuncUndefInstruction(currentSource, ln, name));
          break;
        }
        case 12:
          consumer.consume(new AsyncInstruction(currentSource, ln));
          break;
        case 14:
          consumer.consume(new DescendScopeInstruction());
          break;
        case 15:
          consumer.consume(new AscendScopeInstruction());
          break;
        case 16: {
          const arrayValue = this.resolveVal(reader, currentSource, ln);
          const indexValue = this.resolveVal(reader, currentSource, ln);
          const assignValue = this.resolveVal(reader, currentSource, ln);
          consumer.consume(new ArrayAssignInstruction(currentSource, ln, arrayValue, indexValue, assignValue));
          break;
        }
        case 17: {
          const mapValue = this.resolveVal(reader, currentSource, ln);
          const fieldLen = reader.readByte();
          const field = reader.readBytes(fieldLen).toString("utf8");
          const assignValue = this.resolveVal(reader, currentSource, ln);
          consumer.consume(new MapAssignInstruction(currentSource, ln, mapValue, field, assignValue));
          break;
        }
        default:
          throw new ProducerException(
            `Encountered invalid opcode "${opcode}", perhaps this was compiled for a newer version of Rtfl?`,
            currentSource,
            ln
          );
      }
    }

    consumer.finish();
  }

  static resolveVal(reader: ByteReader, src: string, ln: number): RtflType {
    const type = reader.readByte();

    switch (type) {
      case 0:
        return new NullType();
      case 1:
        return new BoolType(reader.readByte() > 0);
      case 2:
        return new IntType(reader.readInt());
      case 3:
        return new DoubleType(reader.readDouble());
      case 4: {
        const len = reader.readByte();
        return new StringType(reader.readBytes(len).toString("utf8"));
      }
      case 5: {
        const len = reader.readShort();
        return new StringType(reader.readBytes(len).toString("utf8"));
      }
      case 6: {
        const nameLen = reader.readByte();
        const name = reader.readBytes(nameLen).toString("utf8");
        const argLen = reader.readByte();
        const args: RtflType[] = [];
        for (let i = 0; i < argLen; i += 1) {
          args.push(this.resolveVal(reader, src, ln));
        }
        return new FunctionCallAssignment(name, args);
      }
      case 7: {
        const nameLen = reader.readByte();
        const name = reader.readBytes(nameLen).toString("utf8");
        return new VarRefAssignment(name);
      }
      case 8: {
        const compType = reader.readByte();
        const inverse = reader.readByte() > 0;
        const comp1 = this.resolveVal(reader, src, ln);
        const comp2 = this.resolveVal(reader, src, ln);
        return new LogicAssignment(comp1, compType as LogicComparison, comp2, inverse);
      }
      case 9:
        return new NotAssignment(this.resolveVal(reader, src, ln));
      case 10: {
        const arrayValue = this.resolveVal(reader, src, ln);
        const indexValue = this.resolveVal(reader, src, ln);
        return new ArrayIndexAssignment(arrayValue, indexValue);
      }
      case 11: {
        const mapValue = this.resolveVal(reader, src, ln);
        const fieldLen = reader.readByte();
        const field = reader.readBytes(fieldLen).toString("utf8");
        return new MapFieldAssignment(mapValue, field);
      }
      default:
        throw new ProducerException(
          `Encountered invalid value type "${type}", perhaps this was compiled for a newer version of Rtfl?`,
          src,
          ln
        );
    }
  }
}
