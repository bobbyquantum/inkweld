import {
  Controller,
  UseGuards,
  Post,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@Controller('login')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Post('login')
  @UseGuards(AuthGuard('local'))
  async login(@Request() req) {
    if (!req.user) {
      throw new UnauthorizedException('Authentication failed');
    }
    // If we get here, LocalStrategy has validated the user
    await this.authService.login(req, req.user);
    return { hello: 'world', user: req.user };
  }
}
