import {
  Controller,
  UseGuards,
  Post,
  Request,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
  Get,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { LocalAuthGuard } from './local-auth.guard.js';
import {
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { GithubAuthGuard } from './github-auth.guard.js';
import { LoginRequestDto, LoginResponseDto } from './auth.dto.js';

@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LocalAuthGuard)
  @ApiOperation({
    summary: 'Login with username and password',
    description:
      'Authenticates a user using username and password credentials.',
  })
  @ApiHeader({
    name: 'X-CSRF-TOKEN',
    description: 'CSRF token',
    required: true,
  })
  @ApiBody({
    type: LoginRequestDto,
    description: 'User credentials',
  })
  @ApiOkResponse({
    description: 'Successfully authenticated user',
    type: LoginResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication failed' })
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
      enabled: req.user.enabled,
      sessionId: req.sessionID,
    };

    return userResponse;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({
    name: 'X-CSRF-TOKEN',
    description: 'CSRF token',
    required: true,
  })
  @ApiOperation({
    summary: 'Logout the current user',
    description: 'Logs out the current user by destroying the session.',
  })
  @ApiOkResponse({
    description: 'Successfully logged out',
    schema: {
      example: { message: 'Logout successful' },
    },
  })
  async logout(@Req() req) {
    await this.authService.logout(req);
    return { message: 'Logout successful' };
  }

  @Get('providers')
  @ApiOperation({
    summary: 'Get available OAuth2 providers',
    description:
      'Retrieves a list of available OAuth2 authentication providers.',
  })
  @ApiOkResponse({
    description: 'Successfully retrieved OAuth2 providers',
    type: [String],
  })
  getOAuthProviders(): string[] {
    const githubEnabled = this.configService.get('GITHUB_ENABLED');

    if (githubEnabled === 'true') {
      return ['github'];
    }
    return [];
  }

  @Get('authorization/github')
  @UseGuards(GithubAuthGuard)
  @ApiOperation({
    summary: 'Initiate GitHub OAuth login',
    description: 'Redirects the user to GitHub for OAuth authentication',
  })
  async githubLogin() {
    // Initiates GitHub OAuth login
    // The actual redirection is handled by the passport strategy
  }

  @Get('code/github')
  @ApiOperation({
    summary: 'GitHub OAuth callback endpoint',
    description:
      'Handles the callback from GitHub OAuth authentication and redirects the user to the client application',
  })
  @UseGuards(GithubAuthGuard)
  async githubLoginCallback(@Req() req: any, @Res() res) {
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
      const clientUrl =
        this.configService.get('CLIENT_URL') || 'http://localhost:4200';
      res.redirect(`${clientUrl}/welcome?error=server_error`);
    }
  }
}
