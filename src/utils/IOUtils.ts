import fs from "fs";

export function readFile(path: string): string {
  return fs.readFileSync(path, "utf8");
}

export function writeFile(path: string, content: string, append: boolean): void {
  if (append) {
    fs.appendFileSync(path, content, "utf8");
  } else {
    fs.writeFileSync(path, content, "utf8");
  }
}
