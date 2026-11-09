import { describe, expect, it, vi } from "vitest";

import { AppError } from "../src/errors/app.error";
import { asyncHandler } from "../src/utils/async-handler";
import { buildPaginationMeta, getPagination } from "../src/utils/pagination";

describe("pagination", () => {
  it("applique les valeurs par défaut", () => {
    expect(getPagination()).toEqual({ page: 1, limit: 10, skip: 0 });
  });

  it("calcule skip et borne page/limit", () => {
    expect(getPagination("3", "20")).toEqual({ page: 3, limit: 20, skip: 40 });
    expect(getPagination("-5", "0").page).toBe(1);
    expect(getPagination("1", "999").limit).toBe(100);
  });

  it("construit les métadonnées", () => {
    expect(buildPaginationMeta(1, 10, 25)).toEqual({
      page: 1,
      limit: 10,
      total: 25,
      totalPages: 3,
    });
  });
});

describe("AppError", () => {
  it("porte statusCode et isOperational", () => {
    const err = new AppError("x", 404);
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(404);
    expect(err.isOperational).toBe(true);
    expect(new AppError("y").statusCode).toBe(500);
  });
});

describe("asyncHandler", () => {
  it("transmet les erreurs à next", async () => {
    const error = new Error("boom");
    const next = vi.fn();
    asyncHandler(async () => {
      throw error;
    })({} as any, {} as any, next);
    await new Promise((r) => setImmediate(r));
    expect(next).toHaveBeenCalledWith(error);
  });

  it("n'appelle pas next en cas de succès", async () => {
    const next = vi.fn();
    asyncHandler(async () => "ok")({} as any, {} as any, next);
    await new Promise((r) => setImmediate(r));
    expect(next).not.toHaveBeenCalled();
  });
});
