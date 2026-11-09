import { CandidateService } from "../services/candidate.service";

import { createCrudController } from "./crud.controller";

/**
 * Contrôleur Candidate (GET/POST/PUT/DELETE sur /candidates).
 */
export const candidateController = createCrudController(new CandidateService());
