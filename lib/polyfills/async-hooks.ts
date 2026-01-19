/**
 * Browser polyfill for Node.js async_hooks module.
 * Provides a no-op AsyncLocalStorage implementation for libraries
 * that use it for contextual logging (like gov-tracker).
 */

export class AsyncLocalStorage<T> {
  private store: T | undefined;

  run<R>(store: T, callback: () => R): R {
    const previous = this.store;
    this.store = store;
    try {
      return callback();
    } finally {
      this.store = previous;
    }
  }

  getStore(): T | undefined {
    return this.store;
  }

  enterWith(store: T): void {
    this.store = store;
  }

  exit<R>(callback: () => R): R {
    const previous = this.store;
    this.store = undefined;
    try {
      return callback();
    } finally {
      this.store = previous;
    }
  }

  disable(): void {
    this.store = undefined;
  }
}

const asyncHooks = { AsyncLocalStorage };
export default asyncHooks;
