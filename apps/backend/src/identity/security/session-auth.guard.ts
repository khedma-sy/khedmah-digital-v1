import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IdentityService } from '../identity.service';
import { readSessionToken } from '../session-cookie';

const ANONYMOUS_MUTATION = 'khedmah:anonymous-mutation';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Explicit exception for public authentication and anonymous event endpoints. */
export const AllowAnonymousMutation = () => SetMetadata(ANONYMOUS_MUTATION, true);

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(Reflector) private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method.toUpperCase())) return true;

    // Only the explicitly annotated route can bypass the mutation session guard.
    // Class-level metadata would otherwise exempt every present and future write.
    const anonymous = this.reflector.get<boolean>(ANONYMOUS_MUTATION, context.getHandler());
    if (anonymous === true) return true;

    await this.identity.getCurrentUser(readSessionToken(request.headers.cookie));
    return true;
  }
}
