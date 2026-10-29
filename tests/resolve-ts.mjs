// Next.js resolves "@/" paths, extensionless imports and "server-only"; plain Node does not, so map
// them here. "@/" is relative to the project root, where `npm test` runs.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  if (specifier.startsWith("next/") && !path.extname(specifier)) return next(`${specifier}.js`, context);
  const alias = specifier.startsWith("@/");
  const relative = specifier.startsWith("./") || specifier.startsWith("../");
  if ((alias || relative) && !path.extname(specifier) && context.parentURL?.startsWith("file:")) {
    const base = alias
      ? path.resolve(specifier.slice(2))
      : path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    for (const ext of [".ts", ".tsx"]) {
      if (existsSync(base + ext)) return { url: pathToFileURL(base + ext).href, shortCircuit: true };
    }
  }
  return next(specifier, context);
}
