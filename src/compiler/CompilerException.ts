export class CompilerException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompilerException";
  }
}
