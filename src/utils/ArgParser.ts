export class ArgParser {
  private readonly options: Map<string, string | null> = new Map();
  private readonly flags: Set<string> = new Set();
  private readonly args: string[] = [];

  constructor(args: string[]) {
    for (const arg of args) {
      if (arg.startsWith("--") && arg.length > 2) {
        let argStr = arg.slice(2);
        let valStr: string | null = null;

        if (argStr.includes("=") && argStr.indexOf("=") < argStr.length - 1) {
          const splitIndex = argStr.indexOf("=");
          valStr = argStr.slice(splitIndex + 1);
          argStr = argStr.slice(0, splitIndex);
        }

        this.options.set(argStr, valStr);
      } else if (arg.startsWith("-") && arg.length > 1 && arg[1] !== "-") {
        const flagStr = arg.slice(1);
        for (const char of flagStr) {
          this.flags.add(char);
        }
      } else {
        this.args.push(arg);
      }
    }
  }

  arguments(): string[] {
    return this.args;
  }

  flagsList(): string[] {
    return Array.from(this.flags);
  }

  optionsMap(): Map<string, string | null> {
    return this.options;
  }

  option(name: string): boolean {
    return this.options.has(name);
  }

  flag(flag: string): boolean {
    return this.flags.has(flag);
  }

  optionString(name: string): string | null {
    return this.options.get(name) ?? null;
  }

  optionInt(name: string): number {
    const value = this.options.get(name);
    if (value === null || value === undefined) {
      throw new Error(`Option ${name} does not have a value`);
    }
    return Number.parseInt(value, 10);
  }

  optionChar(name: string): string {
    const value = this.options.get(name);
    if (!value || value.length === 0) {
      throw new Error(`Option ${name} does not have a value`);
    }
    return value[0];
  }

  optionDouble(name: string): number {
    const value = this.options.get(name);
    if (value === null || value === undefined) {
      throw new Error(`Option ${name} does not have a value`);
    }
    return Number.parseFloat(value);
  }

  hasValue(name: string): boolean {
    return this.options.get(name) !== null && this.options.get(name) !== undefined;
  }
}
