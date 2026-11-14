import { isAbsolute, resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { ZtError } from "../errors.js";
import type { CommandPlugin } from "../types.js";

export async function loadPlugins(
  specs: string[],
  configPath: string | undefined,
  cwd: string,
): Promise<CommandPlugin[]> {
  const base = configPath ? dirname(configPath) : cwd;
  const loaded: CommandPlugin[] = [];
  for (const spec of specs) {
    const resolved = isAbsolute(spec) ? spec : resolve(base, spec);
    let imported: unknown;
    try {
      imported = await import(pathToFileURL(resolved).href);
    } catch (err) {
      throw new ZtError(`could not load plugin ${spec}: ${(err as Error).message}`, "PLUGIN_LOAD");
    }
    const mod = imported as { default?: Partial<CommandPlugin> } & Partial<CommandPlugin>;
    const plugin = mod.default ?? mod;
    if (!plugin || typeof plugin.name !== "string" || plugin.name.length === 0) {
      throw new ZtError(`plugin ${spec} must export a name`, "PLUGIN_SHAPE");
    }
    if (typeof plugin.register !== "function") {
      throw new ZtError(`plugin ${spec} must export register()`, "PLUGIN_SHAPE");
    }
    loaded.push({
      name: plugin.name,
      description: typeof plugin.description === "string" ? plugin.description : plugin.name,
      register: plugin.register.bind(plugin),
    });
  }
  return loaded;
}
