import type { RtflInstruction } from "../instructions";
import type { InstructionConsumer } from "./InstructionConsumer";

export class CacheInstructionConsumer implements InstructionConsumer {
  readonly cache: RtflInstruction[] = [];

  consume(instruction: RtflInstruction): void {
    this.cache.push(instruction);
  }

  finish(): void {}
}
