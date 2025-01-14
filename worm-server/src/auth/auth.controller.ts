import {
  Controller,
  UseGuards,
  Post,
  Request,
  UnauthorizedException,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service.js';
import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@Controller('login')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService
  ) {}
  @Post('login')
  @UseGuards(AuthGuard('local'))
  async login(@Request() req, @Res() res: Response) {
    if (!req.user) {
      throw new UnauthorizedException('Authentication failed');
    }
    // If we get here, LocalStrategy has validated the user
    await this.authService.login(req, req.user);

    const clientUrl = this.configService.get('CLIENT_URL');
    if (!clientUrl) {
      throw new Error('Client URL not configured');
    }

    return res.redirect(clientUrl);
  }
}
