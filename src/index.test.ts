import { describe, expect, it } from "bun:test";
import { Aponia } from "."

describe("Aponia", () => {
  it("should instantiate", () => {
    const aponia = new Aponia();
    expect(aponia).toBeDefined();
    expect(aponia.app).toBeDefined();
    expect(aponia.fsr).toBeDefined();
    expect(aponia.options).toBeDefined();
    expect(aponia.options.basePath).toBeUndefined();
  })
});
