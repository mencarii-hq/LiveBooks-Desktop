import { ConfigMap } from 'fyo/core/types';
import type { IPC } from 'main/preload';

export class Config {
  config: Map<string, unknown> | IPC['store'];
  constructor(isElectron: boolean) {
    this.config = new Map();
    // `ipc` is injected by the preload script; absent when running under
    // plain node (tests), where the in-memory Map is used instead.
    if (isElectron && typeof ipc !== 'undefined') {
      this.config = ipc.store;
    }
  }

  get<K extends keyof ConfigMap>(
    key: K,
    defaultValue?: ConfigMap[K]
  ): ConfigMap[K] | undefined {
    const value = this.config.get(key) as ConfigMap[K] | undefined;
    return value ?? defaultValue;
  }

  set<K extends keyof ConfigMap>(key: K, value: ConfigMap[K]) {
    this.config.set(key, value);
  }

  delete(key: keyof ConfigMap) {
    this.config.delete(key);
  }
}
