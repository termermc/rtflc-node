import path from "path";
import type { RtflLibrary } from "../RtflLibrary";

export function loadLibrary(libraryPath: string): RtflLibrary {
  const resolved = path.resolve(libraryPath);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require(resolved);
  const candidate = mod?.default ?? mod;

  if (candidate && typeof candidate.initialize === "function") {
    return candidate as RtflLibrary;
  }

  if (typeof candidate === "function") {
    return { initialize: candidate } as RtflLibrary;
  }

  throw new Error("Library does not export an initialize(runtime) function");
}
