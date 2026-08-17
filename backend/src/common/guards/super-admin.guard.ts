import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

// Assumes JwtAuthGuard already ran and populated request.user.
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (!user?.isSuperAdmin) {
      throw new ForbiddenException('Super admin only');
    }
    return true;
  }
}
