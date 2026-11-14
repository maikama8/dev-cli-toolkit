import type { CommandPlugin } from "../types.js";
import { base64Plugin } from "./base64.js";
import { doctorPlugin } from "./doctor.js";
import { envPlugin } from "./env.js";
import { gitPlugin } from "./git.js";
import { httpPlugin } from "./http.js";
import { initPlugin } from "./init.js";
import { jsonPlugin } from "./json.js";
import { jwtPlugin } from "./jwt.js";
import { portPlugin } from "./port.js";
import { uuidPlugin } from "./uuid.js";

/** Built-in commands, in help order. */
export const builtinPlugins: CommandPlugin[] = [
  initPlugin,
  envPlugin,
  gitPlugin,
  portPlugin,
  httpPlugin,
  jsonPlugin,
  base64Plugin,
  jwtPlugin,
  uuidPlugin,
  doctorPlugin,
];
