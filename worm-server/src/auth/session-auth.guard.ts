import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { UserService } from '../user/user.service';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  private readonly logger = new Logger(SessionAuthGuard.name);

  constructor(private readonly userService: UserService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    this.logger.verbose('Session Authentication Check', {
      sessionId: request.sessionID,
      sessionUser: request.session?.userId,
      headers: request.headers,
    });

    // Check if user ID exists in the session
    if (!request.session?.userId) {
      this.logger.warn('No user ID in session');
      throw new UnauthorizedException('Not authenticated');
    }

    try {
      // Attempt to retrieve user from database using session user ID
      const user = await this.userService.getCurrentUser(
        request.session.userId,
      );

      // Attach user to request for use in route handlers
      request.user = {
        id: user.id,
        username: user.username,
        name: user.name,
        avatarImageUrl: user.avatarImageUrl,
      };

      return true;
    } catch (error) {
      this.logger.error('Failed to retrieve user from session', error);
      throw new UnauthorizedException('Invalid session');
    }
  }
}
