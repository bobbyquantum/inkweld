import {
  Injectable,
  ExecutionContext,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GithubAuthGuard extends AuthGuard('github') {
  private logger = new Logger(GithubAuthGuard.name);

  constructor() {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Extensive logging for debugging
    this.logger.verbose('GithubAuthGuard - Request Details', {
      method: request.method,
      url: request.url,
      headers: request.headers,
      session: request.session ? Object.keys(request.session) : 'No session',
      user: request.user ? Object.keys(request.user) : 'No user',
    });

    // Check if user is already authenticated in the session
    if (request.user) {
      this.logger.log(
        'User already authenticated, skipping GitHub authentication',
      );
      return true;
    }

    try {
      const activate = await super.canActivate(context);
      this.logger.log('GitHub authentication result', {
        activate,
        sessionId: request.sessionID,
      });
      return !!activate;
    } catch (error) {
      this.logger.error('GitHub authentication failed', error);
      throw new UnauthorizedException('GitHub authentication failed');
    }
  }

  // Override handleRequest to provide more detailed logging and error handling
  handleRequest(err, user, info) {
    this.logger.log('GitHub handleRequest called', {
      error: err,
      user: user ? Object.keys(user) : 'No user',
      info,
    });

    if (err) {
      this.logger.error('Error during GitHub authentication', err);
      throw err;
    }

    if (!user) {
      this.logger.warn('No user found during GitHub authentication', info);
      throw new UnauthorizedException('GitHub authentication failed');
    }

    this.logger.log('Successfully authenticated user', user.username);
    return user;
  }
}
