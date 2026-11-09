import { Router } from "express";
import { Role } from "@prisma/client";
import { ZodSchema } from "zod";

import { createCrudController } from "../controllers/crud.controller";

import { authMiddleware } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/authorize.middleware";
import { validate } from "../middlewares/validate.middleware";

export interface CrudRoutesOptions {
  controller: ReturnType<typeof createCrudController>;
  createSchema: ZodSchema;
  updateSchema: ZodSchema;
  /** Rôles autorisés en lecture / création / modification. */
  roles: Role[];
}

/**
 * Construit le routeur CRUD standard. Seul ADMIN peut supprimer.
 */
export function buildCrudRoutes({
  controller,
  createSchema,
  updateSchema,
  roles,
}: CrudRoutesOptions): Router {
  const router = Router();
  const access = [authMiddleware, authorize(...roles)];

  router.get("/", ...access, controller.getAll);
  router.get("/:id", ...access, controller.getById);
  router.post("/", ...access, validate(createSchema), controller.create);
  router.put("/:id", ...access, validate(updateSchema), controller.update);
  router.delete(
    "/:id",
    authMiddleware,
    authorize(Role.ADMIN),
    controller.delete
  );

  return router;
}
