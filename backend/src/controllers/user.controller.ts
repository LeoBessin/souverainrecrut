import { UserService } from "../services/user.service";

import { createCrudController } from "./crud.controller";

/**
 * Contrôleur User (GET/POST/PUT/DELETE sur /users).
 */
export const userController = createCrudController(new UserService());
