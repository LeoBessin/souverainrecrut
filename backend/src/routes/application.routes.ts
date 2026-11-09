import { Role } from "@prisma/client";

import { applicationController } from "../controllers/application.controller";

import {
  createApplicationSchema,
  updateApplicationSchema,
} from "../validators/application.schema";

import { buildCrudRoutes } from "./crud.routes";

export default buildCrudRoutes({
  controller: applicationController,
  createSchema: createApplicationSchema,
  updateSchema: updateApplicationSchema,
  roles: [Role.ADMIN, Role.RECRUITER],
});
