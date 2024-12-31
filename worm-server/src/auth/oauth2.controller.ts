import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { GithubAuthGuard } from './github-auth.guard';
import { AuthService } from './auth.service';

@Controller('oauth2')
export class OAuth2Controller {
  constructor(private readonly authService: AuthService) {}

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

      // If user is found or created, log them in
      if (user) {
        await this.authService.login(req, user);

        // Redirect to frontend after successful login
        res.redirect('http://localhost:8333/');
      } else {
        // Handle authentication failure
        res.redirect('http://localhost:8333/login?error=authentication_failed');
      }
    } catch (error) {
      // Handle any errors during login process
      res.redirect('http://localhost:8333/login?error=server_error');
    }
  }

  // Method to add more OAuth providers in the future
  @Get('/providers')
  getOAuthProviders() {
    return {
      providers: [
        {
          name: 'GitHub',
          authorizationUrl: '/oauth2/github',
        },
        // Add more providers as needed
      ],
    };
  }
}
