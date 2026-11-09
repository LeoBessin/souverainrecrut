import { Role } from "@prisma/client";

import { candidateController } from "../controllers/candidate.controller";

import {
  createCandidateSchema,
  updateCandidateSchema,
} from "../validators/candidate.schema";

import { buildCrudRoutes } from "./crud.routes";

export default buildCrudRoutes({
  controller: candidateController,
  createSchema: createCandidateSchema,
  updateSchema: updateCandidateSchema,
  roles: [Role.ADMIN, Role.RECRUITER],
});
