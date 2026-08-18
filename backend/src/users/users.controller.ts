import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me/invitations')
  listMyInvitations(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.listMyInvitations(user.id);
  }

  @Post('me/invitations/:membershipId/accept')
  acceptInvitation(@CurrentUser() user: AuthenticatedUser, @Param('membershipId') membershipId: string) {
    return this.usersService.acceptInvitation(user.id, membershipId);
  }

  @Post('me/invitations/:membershipId/decline')
  declineInvitation(@CurrentUser() user: AuthenticatedUser, @Param('membershipId') membershipId: string) {
    return this.usersService.declineInvitation(user.id, membershipId);
  }
}
