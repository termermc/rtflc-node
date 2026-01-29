import type { RtflInstruction } from "../instructions";

export interface InstructionConsumer {
  consume(instruction: RtflInstruction): void;
  finish(): void;
}
