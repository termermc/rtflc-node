export class ProducerException extends Error {
  private readonly source?: string;
  private readonly line?: number;

  constructor(message: string, source?: string, line?: number) {
    super(source && line ? `${message} (at ${source}:${line})` : message);
    this.name = "ProducerException";
    this.source = source;
    this.line = line;
  }

  originFile(): string | undefined {
    return this.source;
  }

  originLine(): number | undefined {
    return this.line;
  }
}
