import { AsyncLocalStorage } from "node:async_hooks";

export type SiteRuntimeEnv = Record<string, unknown>;

const runtimeEnvironment = new AsyncLocalStorage<SiteRuntimeEnv>();

export function runWithRuntimeEnv<T>(env: SiteRuntimeEnv, callback: () => T): T {
  return runtimeEnvironment.run(env, callback);
}

export function getRuntimeEnv(): SiteRuntimeEnv {
  const env = runtimeEnvironment.getStore();
  if (!env) throw new Error("Ambiente de execução indisponível.");
  return env;
}
