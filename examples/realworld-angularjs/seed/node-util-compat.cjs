// NeDB (the backend's file store, last released 2016) calls util.isDate, util.isArray and friends,
// which Node 23 removed. Preloaded with --require so the vendored backend runs unmodified.
"use strict";

const util = require("node:util");

const shims = {
  isArray: Array.isArray,
  isBoolean: (value) => typeof value === "boolean",
  isBuffer: (value) => Buffer.isBuffer(value),
  isDate: (value) => value instanceof Date,
  isError: (value) => value instanceof Error,
  isFunction: (value) => typeof value === "function",
  isNull: (value) => value === null,
  isNullOrUndefined: (value) => value === null || value === undefined,
  isNumber: (value) => typeof value === "number",
  isObject: (value) => value !== null && typeof value === "object",
  isPrimitive: (value) => value === null || (typeof value !== "object" && typeof value !== "function"),
  isRegExp: (value) => value instanceof RegExp,
  isString: (value) => typeof value === "string",
  isSymbol: (value) => typeof value === "symbol",
  isUndefined: (value) => value === undefined,
};

for (const [name, shim] of Object.entries(shims)) {
  if (typeof util[name] !== "function") util[name] = shim;
}
