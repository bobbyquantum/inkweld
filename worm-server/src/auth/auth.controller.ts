import {
  Controller,
  UseGuards,
  Post,
  Request,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { ApiExcludeController } from '@nestjs/swagger';
import { LocalAuthGuard } from './local-auth.guard.js';

@ApiExcludeController()
@Controller()
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LocalAuthGuard)
  async login(@Request() req) {
    this.logger.log(`Login attempt for user: ${req.user?.username}`);
    this.logger.debug('Request session ID before login: ' + req.sessionID);

    if (!req.user) {
      throw new UnauthorizedException('Authentication failed');
    }

    await this.authService.login(req, req.user);

    this.logger.log(`Login processed for user: ${req.user?.username}`);
    this.logger.debug(
      'Session after login: ' +
        JSON.stringify({
          sessionId: req.sessionID,
          hasUserId: !!req.session?.userId,
          userId: req.session?.userId,
        }),
    );

    // Return user details
    const userResponse = {
      id: req.user.id,
      username: req.user.username,
      name: req.user.name,
      avatarImageUrl: req.user.avatarImageUrl,
      enabled: req.user.enabled,
      sessionId: req.sessionID,
    };

    return userResponse;
  }
}
