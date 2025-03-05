import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { GithubAuthGuard } from './github-auth.guard.js';
import { AuthService } from './auth.service.js';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@Controller('oauth2')
export class OAuth2Controller {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService
  ) {}

  @Get('authorization/github')
  @UseGuards(GithubAuthGuard)
  async githubLogin() {
    // Initiates GitHub OAuth login
    // The actual redirection is handled by the passport strategy
  }

  @Get('code/github')
  @UseGuards(GithubAuthGuard)
  async githubLoginCallback(@Req() req: Request, @Res() res: Response) {
    try {
      // The user is already authenticated by the GithubAuthGuard
      const user = req.user;

      // Get client URL first
      const clientUrl = this.configService.get('CLIENT_URL');
      if (!clientUrl) {
        throw new Error('Client URL not configured');
      }

      // If user is found or created, log them in
      if (user) {
        await this.authService.login(req, user);
        res.redirect(clientUrl);
      } else {
        // Handle authentication failure
        res.redirect(`${clientUrl}/welcome?error=authentication_failed`);
      }
    } catch (_error) {
      // Handle any errors during login process
      const clientUrl = this.configService.get('CLIENT_URL') || 'http://localhost:4200';
      res.redirect(`${clientUrl}/welcome?error=server_error`);
    }
  }
}
