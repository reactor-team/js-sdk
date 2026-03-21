// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, it, expect } from "vitest";
import { ConflictError, AbortError, isAbortError } from "../../src/types";

describe("ConflictError", () => {
  it("is an instance of Error", () => {
    const err = new ConflictError("conflict");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("conflict");
  });
});

describe("AbortError", () => {
  it("is an instance of Error", () => {
    const err = new AbortError("aborted");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("aborted");
  });
});

describe("isAbortError()", () => {
  it("returns true for custom AbortError", () => {
    expect(isAbortError(new AbortError("test"))).toBe(true);
  });

  it("returns true for a DOMException with name AbortError", () => {
    const err = new DOMException("aborted", "AbortError");
    expect(isAbortError(err)).toBe(true);
  });

  it("returns false for a regular Error", () => {
    expect(isAbortError(new Error("test"))).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
    expect(isAbortError("string")).toBe(false);
    expect(isAbortError(42)).toBe(false);
  });
});
