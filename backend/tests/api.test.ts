import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/config/env", () => ({
  env: {
    port: 0,
    jwtSecret: "secret",
    apiVersion: "v1",
    nodeEnv: "test",
    frontendUrl: "http://localhost:5173",
  },
}));
vi.mock("../src/config/prisma", async () => {
  const { prismaMock } = await import("./setup");
  return { prisma: prismaMock };
});

import app from "../src/app";
import { prismaMock } from "./setup";

const token = (role: string) => jwt.sign({ id: "u1", role }, "secret");
const auth = (role = "ADMIN") => ({ Authorization: `Bearer ${token(role)}` });

beforeEach(() => vi.clearAllMocks());

describe("routes publiques", () => {
  it("GET / ", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
  });

  it("GET /v1/health", async () => {
    const res = await request(app).get("/v1/health");
    expect(res.body.data.status).toBe("UP");
  });

  it("GET /v1/ready : 200 puis 503", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce(1);
    expect((await request(app).get("/v1/ready")).status).toBe(200);
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error("down"));
    expect((await request(app).get("/v1/ready")).status).toBe(503);
  });

  it("GET /v1 (info)", async () => {
    const res = await request(app).get("/v1/info");
    expect(res.status).toBe(200);
    expect(res.body.data.name ?? res.body.name).toBe("SouverainRecrut API");
  });

  it("404 inconnue", async () => {
    expect((await request(app).get("/nope")).status).toBe(404);
  });
});

describe("auth", () => {
  it("login OK sans exposer le mot de passe", async () => {
    const password = await bcrypt.hash("pw", 4);
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.c", role: "ADMIN", password });
    const res = await request(app).post("/v1/auth/login").send({ email: "a@b.c", password: "pw" });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.password).toBeUndefined();
  });

  it("login : mauvais mot de passe et utilisateur inconnu → 401", async () => {
    const password = await bcrypt.hash("pw", 4);
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "u1", password, role: "ADMIN" });
    expect((await request(app).post("/v1/auth/login").send({ email: "a@b.c", password: "x" })).status).toBe(401);
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    expect((await request(app).post("/v1/auth/login").send({ email: "a@b.c", password: "pw" })).status).toBe(401);
  });

  it("/me : profil, 404 et 401", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "u1" });
    expect((await request(app).get("/v1/auth/me").set(auth())).status).toBe(200);
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    expect((await request(app).get("/v1/auth/me").set(auth())).status).toBe(404);
    expect((await request(app).get("/v1/auth/me")).status).toBe(401);
  });
});

const jobBody = { title: "Dev", description: "Une description longue", location: "Conakry", company: "ACME", recruiterId: "1" };

describe.each([
  ["jobs", "job", "ADMIN", jobBody, { title: "Nouveau" }],
  ["candidates", "candidate", "RECRUITER", { fullName: "Alice B", email: "a@b.co" }, { fullName: "Zed Zed" }],
  ["applications", "application", "RECRUITER", { candidateId: "1", jobId: "2" }, { status: "ACCEPTED" }],
  ["users", "user", "ADMIN", { firstName: "Alice", lastName: "Bob", email: "a@b.co", password: "Password123!", role: "ADMIN" }, { firstName: "Bobby" }],
])("CRUD /%s", (path, model, role, createBody, updateBody) => {
  const url = `/v1/${path}`;
  const m = () => (prismaMock as any)[model];

  it("liste paginée", async () => {
    m().findMany.mockResolvedValue([{ id: "1" }]);
    m().count.mockResolvedValue(1);
    const res = await request(app).get(`${url}?page=1&limit=5`).set(auth(role));
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(1);
  });

  it("getById 200 / 404", async () => {
    m().findUnique.mockResolvedValueOnce({ id: "1" });
    expect((await request(app).get(`${url}/1`).set(auth(role))).status).toBe(200);
    m().findUnique.mockResolvedValueOnce(null);
    expect((await request(app).get(`${url}/1`).set(auth(role))).status).toBe(404);
  });

  it("create 201 et validation 400", async () => {
    m().findUnique.mockResolvedValue(null);
    m().create.mockResolvedValue({ id: "1" });
    const res = await request(app).post(url).set(auth(role)).send(createBody);
    expect(res.status).toBe(201);
    expect((await request(app).post(url).set(auth(role)).send({})).status).toBe(400);
  });

  it("update 200 et delete 200 (ADMIN)", async () => {
    m().findUnique.mockResolvedValue({ id: "1" });
    m().update.mockResolvedValue({ id: "1" });
    m().delete.mockResolvedValue({ id: "1" });
    expect((await request(app).put(`${url}/1`).set(auth(role)).send(updateBody)).status).toBe(200);
    expect((await request(app).delete(`${url}/1`).set(auth("ADMIN"))).status).toBe(200);
  });

  it("delete interdit à RECRUITER, refus sans token", async () => {
    expect((await request(app).delete(`${url}/1`).set(auth("RECRUITER"))).status).toBe(403);
    expect((await request(app).get(url)).status).toBe(401);
  });
});

describe("règles d'unicité", () => {
  it("candidat : email déjà utilisé → 409", async () => {
    prismaMock.candidate.findUnique.mockResolvedValue({ id: "1" });
    const res = await request(app)
      .post("/v1/candidates")
      .set(auth())
      .send({ fullName: "Alice B", email: "a@b.co" });
    expect(res.status).toBe(409);
  });

  it("utilisateur : email déjà utilisé → 409 ; mot de passe haché à la création", async () => {
    const body = { firstName: "Alice", lastName: "Bob", email: "a@b.co", password: "Password123!", role: "ADMIN" };
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "1" });
    expect((await request(app).post("/v1/users").set(auth()).send(body)).status).toBe(409);

    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    prismaMock.user.create.mockResolvedValue({ id: "2" });
    await request(app).post("/v1/users").set(auth()).send(body);
    expect(prismaMock.user.create.mock.calls[0][0].data.password).not.toBe(body.password);
  });
});

describe("dashboard", () => {
  it("retourne les statistiques", async () => {
    prismaMock.user.count.mockResolvedValue(1);
    prismaMock.candidate.count.mockResolvedValue(2);
    prismaMock.job.count.mockResolvedValue(3);
    prismaMock.application.count.mockResolvedValue(4);
    const res = await request(app).get("/v1/dashboard/stats").set(auth());
    expect(res.status).toBe(200);
  });
});
