import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { cwd } from 'process';

@Injectable()
export class BaseHrefMiddleware implements NestMiddleware {
  private readonly logger = new Logger(BaseHrefMiddleware.name);
  private readonly indexHtmlPath: string;
  private originalIndexHtml: string | null = null;
  // Cache modified HTML by ingressPath to improve performance
  private htmlCache: Map<string, { html: string; timestamp: number }> =
    new Map();
  // Cache TTL in milliseconds (5 minutes)
  private readonly cacheTtl = 5 * 60 * 1000;

  constructor() {
    this.indexHtmlPath = path.resolve(
      path.join(cwd(), '../frontend/dist/browser/index.html'),
    );
    this.loadIndexHtml().catch((err) => {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to load initial index.html: ${errorMessage}`);
    });
  }

  private async loadIndexHtml(): Promise<void> {
    try {
      this.originalIndexHtml = await fs.promises.readFile(
        this.indexHtmlPath,
        'utf8',
      );
      this.logger.log('Original index.html loaded successfully');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error loading index.html: ${errorMessage}`);
      throw error;
    }
  }

  private async getOriginalIndexHtml(): Promise<string> {
    if (!this.originalIndexHtml) {
      await this.loadIndexHtml();
    }
    return this.originalIndexHtml!;
  }

  async use(req: Request, res: Response, next: NextFunction) {
    // Only process index.html requests or requests that would be handled by the catch-all Angular route
    if (!req.path.includes('.') || req.path.endsWith('/index.html')) {
      // Check if X-Ingress-Path header is present
      const ingressPath = req.header('X-Ingress-Path');

      if (ingressPath) {
        try {
          // Normalize the ingress path
          const basePath = ingressPath.endsWith('/')
            ? ingressPath
            : `${ingressPath}/`;

          // Check cache first
          const cachedEntry = this.htmlCache.get(basePath);
          const now = Date.now();

          if (cachedEntry && now - cachedEntry.timestamp < this.cacheTtl) {
            // Use cached version if it exists and is not expired
            this.logger.debug(`Using cached HTML for base path: ${basePath}`);
            return res
              .type('text/html')
              .header('Cache-Control', 'no-cache')
              .send(cachedEntry.html);
          }

          // Get the original index.html content
          const originalHtml = await this.getOriginalIndexHtml();

          // Replace the base href
          const modifiedHtml = originalHtml.replace(
            /<base href="\/"/,
            `<base href="${basePath}"`,
          );

          // Cache the modified HTML
          this.htmlCache.set(basePath, { html: modifiedHtml, timestamp: now });

          // Send the modified HTML with no-cache to ensure fresh content
          return res
            .type('text/html')
            .header('Cache-Control', 'no-cache')
            .send(modifiedHtml);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          this.logger.error(`Error modifying index.html: ${errorMessage}`);
          return next();
        }
      }
    }

    next();
  }
}
