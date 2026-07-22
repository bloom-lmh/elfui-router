/** Safe development flag for direct ESM/test execution and bundler replacement. */
export const DEV = typeof __DEV__ === "undefined" ? true : __DEV__;
