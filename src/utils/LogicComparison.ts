export enum LogicComparison {
  EQUAL,
  AND,
  OR,
  GREATER,
  LESS,
}

export namespace LogicComparison {
  export function byChar(ch: string): LogicComparison | null {
    switch (ch) {
      case "=":
        return LogicComparison.EQUAL;
      case "&":
        return LogicComparison.AND;
      case "|":
        return LogicComparison.OR;
      case ">":
        return LogicComparison.GREATER;
      case "<":
        return LogicComparison.LESS;
      default:
        return null;
    }
  }

  export function toChar(comp: LogicComparison): string {
    switch (comp) {
      case LogicComparison.EQUAL:
        return "=";
      case LogicComparison.AND:
        return "&";
      case LogicComparison.OR:
        return "|";
      case LogicComparison.GREATER:
        return ">";
      case LogicComparison.LESS:
        return "<";
      default:
        return "=";
    }
  }
}
