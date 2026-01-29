import type { RtflInstruction } from "../instructions";

export class RuntimeException extends Error {
  private readonly causeInstruction?: RtflInstruction | null;

  constructor(message: string, causeInstruction?: RtflInstruction | null) {
    super(message);
    this.name = "RuntimeException";
    this.causeInstruction = causeInstruction ?? null;
  }

  cause(): RtflInstruction | null {
    return this.causeInstruction ?? null;
  }
}
