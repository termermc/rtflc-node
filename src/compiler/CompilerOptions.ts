export class CompilerOptions {
  private compileLoads = false;
  private compileRequires = false;
  private packageLoads = false;
  private packageRequires = false;
  private preserveLines = true;

  compileLiteralLoads(set: boolean): this {
    this.compileLoads = set;
    return this;
  }

  compileLiteralLoadsEnabled(): boolean {
    return this.compileLoads;
  }

  compileLiteralRequires(set: boolean): this {
    this.compileRequires = set;
    return this;
  }

  compileLiteralRequiresEnabled(): boolean {
    return this.compileRequires;
  }

  packageLiteralLoads(set: boolean): this {
    this.packageLoads = set;
    return this;
  }

  packageLiteralLoadsEnabled(): boolean {
    return this.packageLoads;
  }

  packageLiteralRequires(set: boolean): this {
    this.packageRequires = set;
    return this;
  }

  packageLiteralRequiresEnabled(): boolean {
    return this.packageRequires;
  }

  preserveLineNumbers(set: boolean): this {
    this.preserveLines = set;
    return this;
  }

  preserveLineNumbersEnabled(): boolean {
    return this.preserveLines;
  }
}
