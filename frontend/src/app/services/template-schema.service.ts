import { Injectable } from '@angular/core';
import {
  DOMOutputSpec,
  Mark as ProseMirrorMark,
  MarkSpec,
  Node as ProseMirrorNode,
  NodeSpec,
  Schema,
} from 'prosemirror-model';
import { BehaviorSubject, Observable } from 'rxjs';

import {
  Template,
  TemplateMarkSpec,
  TemplateNodeSpec,
  TemplateSchema,
} from '../models/template.model';

@Injectable({
  providedIn: 'root',
})
export class TemplateSchemaService {
  /**
   * Observable for the currently active ProseMirror schema
   */
  readonly activeSchema$: Observable<Schema | null>;

  /**
   * Observable for the currently active template
   */
  readonly activeTemplate$: Observable<Template | null>;

  private activeSchemaSubject = new BehaviorSubject<Schema | null>(null);
  private activeTemplateSubject = new BehaviorSubject<Template | null>(null);

  constructor() {
    this.activeSchema$ = this.activeSchemaSubject.asObservable();
    this.activeTemplate$ = this.activeTemplateSubject.asObservable();
  }

  /**
   * Creates a ProseMirror Schema from a template definition
   */
  createSchema(template: Template): Schema {
    const nodes = this.convertTemplateSchemaToProseMirror(template.schema);
    const schema = new Schema({
      nodes,
      marks: template.schema.marks
        ? this.convertTemplateMarksToSchema(template.schema.marks)
        : {},
    });

    this.activeSchemaSubject.next(schema);
    this.activeTemplateSubject.next(template);
    return schema;
  }

  /**
   * Validates a template schema definition
   */
  validateSchema(schema: TemplateSchema): boolean {
    try {
      // Validate node specifications
      for (const [nodeName, nodeSpec] of Object.entries(schema.nodes)) {
        this.validateNodeSpec(nodeName, nodeSpec);
      }

      // Validate mark specifications if present
      if (schema.marks) {
        for (const [markName, markSpec] of Object.entries(schema.marks)) {
          this.validateMarkSpec(markName, markSpec);
        }
      }

      return true;
    } catch (error) {
      console.error('Schema validation failed:', error);
      return false;
    }
  }

  /**
   * Converts template schema nodes to ProseMirror NodeSpec format
   */
  private convertTemplateSchemaToProseMirror(
    schema: TemplateSchema
  ): Record<string, NodeSpec> {
    const nodes: Record<string, NodeSpec> = {};

    // Convert each template node to ProseMirror node spec
    for (const [name, spec] of Object.entries(schema.nodes)) {
      nodes[name] = this.convertNodeSpec(spec);
    }

    // Ensure required base nodes are present
    if (!nodes['doc']) {
      nodes['doc'] = {
        content: 'block+',
      };
    }

    if (!nodes['text']) {
      nodes['text'] = {
        group: 'inline',
      };
    }

    return nodes;
  }

  /**
   * Converts template mark specifications to ProseMirror MarkSpec format
   */
  private convertTemplateMarksToSchema(
    marks: Record<string, TemplateMarkSpec>
  ): Record<string, MarkSpec> {
    const result: Record<string, MarkSpec> = {};

    for (const [name, spec] of Object.entries(marks)) {
      result[name] = this.convertMarkSpec(spec);
    }

    return result;
  }

  /**
   * Converts a template node specification to ProseMirror NodeSpec
   */
  private convertNodeSpec(spec: TemplateNodeSpec): NodeSpec {
    const nodeSpec: NodeSpec = {
      ...spec,
      attrs: spec.attrs
        ? Object.fromEntries(
            Object.entries(spec.attrs).map(([key, attr]) => [
              key,
              { default: attr.default },
            ])
          )
        : undefined,
    };

    // Convert toDOM function if present
    if (spec.toDOM) {
      const originalToDOM = spec.toDOM;
      nodeSpec.toDOM = (node: ProseMirrorNode): DOMOutputSpec => {
        return originalToDOM(node);
      };
    }

    // Convert parseDOM if present
    if (spec.parseDOM) {
      nodeSpec.parseDOM = spec.parseDOM;
    }

    return nodeSpec;
  }

  /**
   * Converts a template mark specification to ProseMirror MarkSpec
   */
  private convertMarkSpec(spec: TemplateMarkSpec): MarkSpec {
    const markSpec: MarkSpec = {
      ...spec,
      attrs: spec.attrs
        ? Object.fromEntries(
            Object.entries(spec.attrs).map(([key, attr]) => [
              key,
              { default: attr.default },
            ])
          )
        : undefined,
    };

    // Convert toDOM function if present
    if (spec.toDOM) {
      const originalToDOM = spec.toDOM;
      markSpec.toDOM = (
        mark: ProseMirrorMark,
        inline: boolean
      ): DOMOutputSpec => {
        return originalToDOM(mark, inline);
      };
    }

    // Convert parseDOM if present
    if (spec.parseDOM) {
      markSpec.parseDOM = spec.parseDOM;
    }

    return markSpec;
  }

  /**
   * Validates a node specification
   */
  private validateNodeSpec(name: string, spec: TemplateNodeSpec): void {
    if (!name || typeof name !== 'string') {
      throw new Error(`Invalid node name: ${name}`);
    }

    if (spec.content && typeof spec.content !== 'string') {
      throw new Error(`Invalid content expression for node ${name}`);
    }

    if (spec.group && typeof spec.group !== 'string') {
      throw new Error(`Invalid group for node ${name}`);
    }

    if (spec.toDOM && typeof spec.toDOM !== 'function') {
      throw new Error(`Invalid toDOM handler for node ${name}`);
    }

    // Validate attributes if present
    if (spec.attrs) {
      this.validateAttributes(name, spec.attrs);
    }
  }

  /**
   * Validates a mark specification
   */
  private validateMarkSpec(name: string, spec: TemplateMarkSpec): void {
    if (!name || typeof name !== 'string') {
      throw new Error(`Invalid mark name: ${name}`);
    }

    if (spec.excludes && typeof spec.excludes !== 'string') {
      throw new Error(`Invalid excludes expression for mark ${name}`);
    }

    if (spec.group && typeof spec.group !== 'string') {
      throw new Error(`Invalid group for mark ${name}`);
    }

    if (spec.toDOM && typeof spec.toDOM !== 'function') {
      throw new Error(`Invalid toDOM handler for mark ${name}`);
    }

    // Validate attributes if present
    if (spec.attrs) {
      this.validateAttributes(name, spec.attrs);
    }
  }

  /**
   * Validates attribute specifications
   */
  private validateAttributes(
    owner: string,
    attrs: Record<string, unknown>
  ): void {
    for (const [attrName, attrSpec] of Object.entries(attrs)) {
      if (!attrName || typeof attrName !== 'string') {
        throw new Error(`Invalid attribute name in ${owner}: ${attrName}`);
      }

      if (attrSpec && typeof attrSpec !== 'object') {
        throw new Error(
          `Invalid attribute specification in ${owner}.${attrName}`
        );
      }
    }
  }
}
