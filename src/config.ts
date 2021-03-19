import {InvalidConfigError} from './errors';
import {Application} from './app';

export const CONFIG_MODULE_ENVAR = 'NODE_CONFIG_MODULE';

export interface Config {
  createApplication(): Promise<Application>;
}

export function isConfig(obj: unknown): obj is Config {
  return (
    obj !== undefined &&
    typeof obj === 'object' &&
    typeof (obj as Partial<Config>)?.createApplication === 'function'
  );
}

export async function loadConfig(): Promise<Config> {
  const module = process.env[CONFIG_MODULE_ENVAR];
  if (module === undefined) {
    throw new InvalidConfigError({
      message: `Failed to load config: envar ${CONFIG_MODULE_ENVAR} is not set`,
    });
  }
  return loadConfigFromModule(module);
}

export async function loadConfigFromModule(module: string): Promise<Config> {
  let config: Config;
  try {
    config = require(module)?.default;
  } catch (e) {
    throw new InvalidConfigError({
      message: `Failed to load config from module "${module}": ${e}`,
      nested: e,
    });
  }

  if (isConfig(config)) {
    return config;
  }
  throw new InvalidConfigError({
    message: `Failed to load config from module "${module}": Loaded module did not export a valid Config object`,
  });
}
