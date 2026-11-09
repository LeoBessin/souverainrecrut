import { Role } from "@prisma/client";

import { jobController } from "../controllers/job.controller";

import {
  createJobSchema,
  updateJobSchema,
} from "../validators/job.schema";

import { buildCrudRoutes } from "./crud.routes";

export default buildCrudRoutes({
  controller: jobController,
  createSchema: createJobSchema,
  updateSchema: updateJobSchema,
  roles: [Role.ADMIN, Role.RECRUITER],
});
