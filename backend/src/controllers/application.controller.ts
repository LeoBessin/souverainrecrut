import { ApplicationService } from "../services/application.service";

import { createCrudController } from "./crud.controller";

/**
 * Contrôleur Application (GET/POST/PUT/DELETE sur /applications).
 */
export const applicationController = createCrudController(new ApplicationService());
