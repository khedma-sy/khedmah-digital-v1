import type { NextFunction, Request, Response } from 'express';
import { PlatformLogger } from '../logging/platform-logger';
export declare function createRequestContextMiddleware(logger: PlatformLogger): (request: Request, response: Response, next: NextFunction) => void;
