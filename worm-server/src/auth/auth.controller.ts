import {
  Controller,
  Get,
  UseGuards,
  Req,
  Res,
  HttpStatus,
  Post,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';

@Controller('login')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Post('login')
  @UseGuards(AuthGuard('local'))
  async login(@Request() req) {
    // If we get here, LocalStrategy has validated the user
    this.authService.login(req, req.user);
    return { hello: 'world', user: req.user };
  }
}
