export const CONFIG_ENVAR = 'CUDL_SERVICES_CONFIG';

export function loadConfigFromEnvar(): Config {
  const configModulePath = process.env[CONFIG_ENVAR];
  if (!configModulePath) {
    throw new Error(`\
Configuration not found: envar ${CONFIG_ENVAR} be set to the path of the \
config module to load`);
  }

  return require(configModulePath);
}

export interface Config {
  dataDir: string;
  users: Users;
  darwinXTF: string;
  [index: string]: unknown;
}

export interface Users {
  [apiKey: string]: User;
}

export interface User {
  username: string;
  email: string;
}
