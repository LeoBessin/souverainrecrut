import { Request, Response } from "express";

import { asyncHandler } from "../utils/async-handler";
import {
  buildPaginationMeta,
  getPagination,
} from "../utils/pagination";

/**
 * Contrat minimal qu'un service doit respecter
 * pour être exposé via le contrôleur CRUD générique.
 */
export interface CrudService {
  getAll(
    skip: number,
    take: number
  ): Promise<{ items: unknown[]; total: number }>;
  getById(id: string): Promise<unknown>;
  create(data: any): Promise<unknown>;
  update(id: string, data: any): Promise<unknown>;
  delete(id: string): Promise<unknown>;
}

/**
 * Construit les handlers CRUD (getAll, getById,
 * create, update, delete) pour un service donné.
 */
export function createCrudController(service: CrudService) {
  return {
    getAll: asyncHandler(async (req: Request, res: Response) => {
      const { page, limit, skip } = getPagination(
        req.query.page as string,
        req.query.limit as string
      );

      const result = await service.getAll(skip, limit);

      res.status(200).json({
        success: true,
        data: result.items,
        pagination: buildPaginationMeta(page, limit, result.total),
      });
    }),

    getById: asyncHandler(async (req: Request, res: Response) => {
      const data = await service.getById(String(req.params.id));

      res.status(200).json({ success: true, data });
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
      const data = await service.create(req.body);

      res.status(201).json({ success: true, data });
    }),

    update: asyncHandler(async (req: Request, res: Response) => {
      const data = await service.update(
        String(req.params.id),
        req.body
      );

      res.status(200).json({ success: true, data });
    }),

    delete: asyncHandler(async (req: Request, res: Response) => {
      const data = await service.delete(String(req.params.id));

      res.status(200).json({ success: true, data });
    }),
  };
}
