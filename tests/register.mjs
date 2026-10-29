// Lets `node --test` load the app's TypeScript modules directly (Node strips the types).
import { register } from "node:module";

register("./resolve-ts.mjs", import.meta.url);
