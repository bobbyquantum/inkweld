import { Controller, Get, Post, Req, Res, Body, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { McpService } from './mcp.service.js';

@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(private readonly mcpService: McpService) {}

  /**
   * GET route to establish an SSE connection.
   * The client will keep this open to receive push messages from the server.
   */
  @Get('sse')
  public getSse(@Req() _req: Request, @Res() res: Response) {
    this.logger.log('SSE GET request received');

    // Cast from Express's Response to Node.js `ServerResponse`
    this.mcpService.startSSE(res as any);
    // We'll let the transport handle setting headers and such
  }

  /**
   * POST route for sending JSON-RPC messages to the SSE-based transport.
   */
  @Post('sse')
  public postSse(@Req() req: Request, @Res() res: Response, @Body() body: any) {
    this.logger.log('SSE POST request received:', body);

    // Cast from Express's Request/Response to Node’s IncomingMessage/ServerResponse
    this.mcpService.handleSSEPost(req as any, res as any, body);
  }
}
