import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("../src/config/env", () => ({
  env: { jwtSecret: "secret", apiVersion: "v1", nodeEnv: "test", frontendUrl: "http://x" },
}));

import { AppError } from "../src/errors/app.error";
import { authMiddleware } from "../src/middlewares/auth.middleware";
import { authorize } from "../src/middlewares/authorize.middleware";
import { errorMiddleware } from "../src/middlewares/error.middleware";
import { notFoundMiddleware } from "../src/middlewares/not-found.middleware";
import { validate } from "../src/middlewares/validate.middleware";

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe("authMiddleware", () => {
  const run = (authorization?: string) => {
    const req: any = { headers: { authorization } };
    const next = vi.fn();
    authMiddleware(req, mockRes(), next);
    return { req, next };
  };

  it("refuse sans en-tête", () => {
    expect(run().next.mock.calls[0][0].statusCode).toBe(401);
  });

  it("refuse un schéma non Bearer ou sans token", () => {
    expect(run("Basic abc").next.mock.calls[0][0].message).toBe("Token invalide.");
    expect(run("Bearer").next.mock.calls[0][0].message).toBe("Token invalide.");
  });

  it("refuse un token invalide", () => {
    expect(run("Bearer nope").next.mock.calls[0][0].message).toMatch(/expiré/);
  });

  it("accepte un token valide et renseigne req.user", () => {
    const token = jwt.sign({ id: "1", role: "ADMIN" }, "secret");
    const { req, next } = run(`Bearer ${token}`);
    expect(req.user).toEqual({ id: "1", role: "ADMIN" });
    expect(next).toHaveBeenCalledWith();
  });
});

describe("authorize", () => {
  it("401 sans utilisateur", () => {
    const next = vi.fn();
    authorize("ADMIN" as any)({} as any, mockRes(), next);
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  it("403 si rôle insuffisant", () => {
    const next = vi.fn();
    authorize("ADMIN" as any)({ user: { role: "RECRUITER" } } as any, mockRes(), next);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });

  it("laisse passer un rôle autorisé", () => {
    const next = vi.fn();
    authorize("ADMIN" as any)({ user: { role: "ADMIN" } } as any, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });
});

describe("validate", () => {
  const schema = z.object({ name: z.string().min(2) });

  it("renvoie 400 avec les détails", () => {
    const res = mockRes();
    const next = vi.fn();
    validate(schema)({ body: { name: "a" } } as any, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.details[0].field).toBe("name");
    expect(next).not.toHaveBeenCalled();
  });

  it("remplace le body et appelle next", () => {
    const req: any = { body: { name: "abc", extra: 1 } };
    const next = vi.fn();
    validate(schema)(req, mockRes(), next);
    expect(req.body).toEqual({ name: "abc" });
    expect(next).toHaveBeenCalled();
  });
});

describe("errorMiddleware / notFound", () => {
  it("formate une AppError", () => {
    const res = mockRes();
    errorMiddleware(new AppError("nope", 409), {} as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("masque les erreurs inconnues en 500", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = mockRes();
    errorMiddleware(new Error("secret"), {} as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain("secret");
    spy.mockRestore();
  });

  it("404 sur route inconnue", () => {
    const res = mockRes();
    notFoundMiddleware({ originalUrl: "/zzz" } as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].error.message).toContain("/zzz");
  });
});
