import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ElementTypeSchema } from '../../models/schema-types';

/**
 * Service for loading default worldbuilding templates from client-side assets
 * This ensures templates are available in offline mode
 */
@Injectable({
  providedIn: 'root',
})
export class DefaultTemplatesService {
  private http = inject(HttpClient);
  private readonly TEMPLATES_BASE_PATH = '/assets/default-templates/';

  private cachedTemplates: Map<string, ElementTypeSchema> | null = null;

  /**
   * Load all default templates from assets
   * Results are cached after first load
   */
  async loadDefaultTemplates(): Promise<Record<string, ElementTypeSchema>> {
    // Return cached templates if available
    if (this.cachedTemplates) {
      return Object.fromEntries(this.cachedTemplates);
    }

    try {
      // Load the index file to get list of templates
      interface TemplateIndex {
        templates: Array<{
          id: string;
          type: string;
          name: string;
          file: string;
        }>;
      }

      const index = await firstValueFrom(
        this.http.get<TemplateIndex>(`${this.TEMPLATES_BASE_PATH}index.json`)
      );

      // Load each template file
      const templates = new Map<string, ElementTypeSchema>();

      for (const templateInfo of index.templates) {
        const template = await firstValueFrom(
          this.http.get<ElementTypeSchema>(
            `${this.TEMPLATES_BASE_PATH}${templateInfo.file}`
          )
        );
        templates.set(template.type, template);
      }

      // Cache the results
      this.cachedTemplates = templates;

      return Object.fromEntries(templates);
    } catch (error) {
      console.error(
        '[DefaultTemplatesService] Failed to load default templates:',
        error
      );
      throw error;
    }
  }

  /**
   * Get a specific default template by type
   */
  async getDefaultTemplate(
    type: string
  ): Promise<ElementTypeSchema | undefined> {
    const templates = await this.loadDefaultTemplates();
    return templates[type];
  }

  /**
   * Get all default template types
   */
  async getDefaultTemplateTypes(): Promise<string[]> {
    const templates = await this.loadDefaultTemplates();
    return Object.keys(templates);
  }

  /**
   * Clear the template cache (useful for testing or forcing reload)
   */
  clearCache(): void {
    this.cachedTemplates = null;
  }
}
