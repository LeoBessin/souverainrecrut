import { Role } from "@prisma/client";

import { userController } from "../controllers/user.controller";

import {
  createUserSchema,
  updateUserSchema,
} from "../validators/user.schema";

import { buildCrudRoutes } from "./crud.routes";

export default buildCrudRoutes({
  controller: userController,
  createSchema: createUserSchema,
  updateSchema: updateUserSchema,
  roles: [Role.ADMIN],
});
