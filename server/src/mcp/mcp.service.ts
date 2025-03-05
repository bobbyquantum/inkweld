import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { IncomingMessage, ServerResponse } from 'http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

import {
  CallToolRequestSchema,
  InitializedNotificationSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { ProjectService } from '../project/project.service.js';
import { YjsGateway } from '../ws/yjs-gateway.js';

@Injectable()
export class McpService implements OnModuleInit {
  private readonly logger = new Logger(McpService.name);

  // The MCP server instance
  private mcpServer!: Server;
  // We'll store the transport here once we create it
  private transport: SSEServerTransport | null = null;

  constructor(
    private readonly projectService: ProjectService,
    private readonly yjsGateway: YjsGateway,
  ) {}

  async onModuleInit() {
    // Instantiate the MCP Server
    this.mcpServer = new Server(
      {
        name: 'inkweld-mcp-service',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupRequestHandlers();
  }

  /**
   * Called by the controller when a GET /mcp/sse route is requested to establish SSE.
   */
  public startSSE(res: ServerResponse) {
    // if (this.transport) {
    //   // If we already have a transport, we might need to handle multiple sessions
    //   // or close the old one. For a single session, let's just log a warning:
    //   this.logger.warn('SSE transport is already set up!');
    //   return;
    // }

    // SSEServerTransport constructor takes an endpoint (used as the POST route),
    // plus the raw Node `ServerResponse`.
    this.transport = new SSEServerTransport('/mcp/sse', res);

    // Connect the transport to our MCP server
    this.mcpServer.connect(this.transport).catch((err) => {
      this.logger.error('Error connecting SSE transport:', err);
    });

    this.logger.log('SSE transport initialized');
  }

  /**
   * Called by the controller when a POST /mcp/sse route is requested
   * to send JSON-RPC messages from the client.
   */
  public async handleSSEPost(
    req: IncomingMessage,
    res: ServerResponse,
    parsedBody: any,
  ) {
    this.logger.log('Handling SSE POST request:', parsedBody);
    if (!this.transport) {
      this.logger.warn('No SSE transport available to handle POST!');
      res.statusCode = 400;
      res.end('No SSE transport established');
      return;
    }

    try {
      await this.transport.handlePostMessage(req, res, parsedBody);
    } catch (error) {
      this.logger.error('Error handling SSE POST:', error);
      res.statusCode = 500;
      res.end('Failed to handle SSE POST message');
    }
  }

  /**
   * Example of registering our tool handlers
   */
  private setupRequestHandlers() {
    // 1) List Tools
    this.mcpServer.setNotificationHandler(InitializedNotificationSchema, () => {
      this.logger.log('MCP Server initialized notification');
    });
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logger.log('Listing tools');
      return {
        tools: [
          {
            name: 'list_projects',
            description: 'List all projects',
            inputSchema: { type: 'object', properties: {}, required: [] },
          },
          {
            name: 'update_document',
            description: 'Update a project doc via Yjs',
            inputSchema: {
              type: 'object',
              properties: {
                documentId: { type: 'string' },
                content: { type: 'string' },
              },
              required: ['documentId', 'content'],
            },
          },
        ],
      };
    });

    // 2) Handle tool calls
    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      this.logger.log('Received tool request:', request.params);
      switch (request.params.name) {
        case 'list_projects':
          return this.handleListProjects();

        case 'update_document':
          return this.handleUpdateDocument(
            request.params.arguments as { documentId: string; content: string },
          );

        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    });
  }

  private async handleListProjects() {
    // Example usage of a project service
    this.logger.log('Listing projects for user "system"');
    const projects = await this.projectService.findAll();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(projects, null, 2),
        },
      ],
    };
  }

  private async handleUpdateDocument(args: {
    documentId: string;
    content: string;
  }) {
    // Example usage of Yjs Gateway
    await this.yjsGateway.updateDocument(args.documentId, args.content);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true }, null, 2),
        },
      ],
    };
  }
}
