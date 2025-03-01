import {
  Controller,
  UseGuards,
  Post,
  Request,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { ApiExcludeController } from '@nestjs/swagger';
import { LocalAuthGuard } from './local-auth.guard.js';

@ApiExcludeController()
@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LocalAuthGuard)
  async login(@Request() req) {
    if (!req.user) {
      throw new UnauthorizedException('Authentication failed');
    }

    await this.authService.login(req, req.user);

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
