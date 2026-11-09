import { vi } from "vitest";

/** Faux client Prisma partagé par les tests (aucune BDD requise). */
const model = () => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  count: vi.fn(),
});

export const prismaMock = {
  user: model(),
  candidate: model(),
  job: model(),
  application: model(),
  $queryRaw: vi.fn(),
};
