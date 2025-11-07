/**
 * Cloudflare Workers adapter for Inkweld NestJS backend
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

let app: any;

async function getApp() {
  if (!app) {
    app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log'],
    });
    await app.init();
  }
  return app;
}

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      const nestApp = await getApp();
      const httpAdapter = nestApp.getHttpAdapter();
      const instance = httpAdapter.getInstance();
      
      // Convert Cloudflare Request to Node.js-like request
      const url = new URL(request.url);
      const method = request.method;
      const headers: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        headers[key] = value;
      });
      
      // Create a promise to capture the response
      return new Promise((resolve) => {
        const mockReq: any = {
          method,
          url: url.pathname + url.search,
          headers,
          socket: {},
          connection: {},
        };
        
        const mockRes: any = {
          statusCode: 200,
          headers: {} as Record<string, string>,
          body: '',
          headersSent: false,
          
          status(code: number) {
            this.statusCode = code;
            return this;
          },
          
          setHeader(key: string, value: string | string[]) {
            this.headers[key] = Array.isArray(value) ? value.join(', ') : value;
            return this;
          },
          
          getHeader(key: string) {
            return this.headers[key];
          },
          
          removeHeader(key: string) {
            delete this.headers[key];
          },
          
          writeHead(statusCode: number, headers?: Record<string, string>) {
            this.statusCode = statusCode;
            if (headers) {
              Object.assign(this.headers, headers);
            }
          },
          
          write(chunk: any) {
            this.body += chunk.toString();
          },
          
          end(data?: any) {
            if (data) {
              this.body += typeof data === 'string' ? data : data.toString();
            }
            
            resolve(new Response(this.body, {
              status: this.statusCode,
              headers: this.headers,
            }));
          },
          
          send(data: any) {
            this.body = typeof data === 'string' ? data : JSON.stringify(data);
            this.end();
            return this;
          },
          
          json(data: any) {
            this.headers['Content-Type'] = 'application/json';
            this.body = JSON.stringify(data);
            this.end();
            return this;
          },
        };
        
        // Handle the request with Express
        instance(mockReq, mockRes);
      });
      
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(
        JSON.stringify({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  },
};
