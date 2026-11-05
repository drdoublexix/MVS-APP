if (typeof Array.prototype.findLastIndex !== 'function') {
  // Expo Router uses this ES2023 method in runtimes that may not provide it.
  // eslint-disable-next-line no-extend-native
  Object.defineProperty(Array.prototype, 'findLastIndex', {
    configurable: true,
    writable: true,
    value: function (
      this: unknown[],
      predicate: (value: unknown, index: number, array: unknown[]) => unknown,
      thisArg?: unknown,
    ): number {
      if (typeof predicate !== 'function') {
        throw new TypeError('predicate must be a function');
      }

      for (let index = this.length - 1; index >= 0; index -= 1) {
        if (predicate.call(thisArg, this[index], index, this)) {
          return index;
        }
      }

      return -1;
    },
  });
}
