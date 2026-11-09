import { JobService } from "../services/job.service";

import { createCrudController } from "./crud.controller";

/**
 * Contrôleur Job (GET/POST/PUT/DELETE sur /jobs).
 */
export const jobController = createCrudController(new JobService());
