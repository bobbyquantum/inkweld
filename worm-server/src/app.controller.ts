import { Controller, Get, Req, Res } from '@nestjs/common';
import { readFileSync } from 'fs';
import path from 'path';
import { cwd } from 'process';

@Controller()
export class AppController {
  constructor() {}

  @Get('*')
  async serveIndex(@Req() req, @Res() res) {
    const url = req.raw.url;
    if (
      url.startsWith('/api') ||
      url.startsWith('/login') ||
      url.startsWith('/oauth2') ||
      url.startsWith('/mcp') ||
      url.startsWith('/ws') ||
      url.startsWith('/assets') ||
      url.startsWith('/chunk') ||
      url.startsWith('/main') ||
      url.startsWith('/polyfills') ||
      url.startsWith('/favicon.ico')
    ) {
      res.status(404).send({ message: 'Not Found' });
      return;
    }

    const indexHtml = readFileSync(
      path.join(cwd(), 'frontend/dist/browser/index.html'),
      'utf8',
    );
    res.header('Content-Type', 'text/html; charset=utf-8');
    res.send(indexHtml);
  }
}
