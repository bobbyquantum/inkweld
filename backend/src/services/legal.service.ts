import type { DatabaseInstance } from '../types/context';
import { configService } from './config.service';

export const LEGAL_DOCUMENTS = ['privacy', 'terms'] as const;
export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number];

/** One legal document as configured by the admin. Content wins over the URL. */
export interface LegalDocumentConfig {
  /** Markdown body served by the /privacy or /terms page. */
  content?: string;
  /** External page to redirect to when no content is configured. */
  url?: string;
}

export interface LegalState {
  privacy: LegalDocumentConfig;
  terms: LegalDocumentConfig;
  /**
   * Opaque token identifying the current wording of both documents, or
   * undefined when neither is configured. Changes whenever an admin edits a
   * document's text or URL, which is what triggers re-acceptance.
   */
  version?: string;
  /** REQUIRE_POLICY_ACCEPTANCE is on AND there is something to accept. */
  requireAcceptance: boolean;
}

function toDocument(content: string, url: string): LegalDocumentConfig {
  const trimmedContent = content.trim();
  if (trimmedContent) return { content: trimmedContent };
  const trimmedUrl = url.trim();
  return trimmedUrl ? { url: trimmedUrl } : {};
}

function isConfigured(doc: LegalDocumentConfig): boolean {
  return !!(doc.content || doc.url);
}

/**
 * Short SHA-256 of both documents. Web Crypto so it runs on Bun and Workers.
 * Exported for tests; callers should use getLegalState().
 */
export async function computeLegalVersion(
  privacy: LegalDocumentConfig,
  terms: LegalDocumentConfig
): Promise<string | undefined> {
  if (!isConfigured(privacy) && !isConfigured(terms)) return undefined;
  const payload = JSON.stringify([
    privacy.content ?? '',
    privacy.url ?? '',
    terms.content ?? '',
    terms.url ?? '',
  ]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

class LegalService {
  async getLegalState(db: DatabaseInstance): Promise<LegalState> {
    const cfg = await configService.getMany(db, [
      'PRIVACY_POLICY_CONTENT',
      'PRIVACY_POLICY_URL',
      'TERMS_OF_SERVICE_CONTENT',
      'TERMS_OF_SERVICE_URL',
      'REQUIRE_POLICY_ACCEPTANCE',
    ] as const);

    const privacy = toDocument(cfg.PRIVACY_POLICY_CONTENT.value, cfg.PRIVACY_POLICY_URL.value);
    const terms = toDocument(cfg.TERMS_OF_SERVICE_CONTENT.value, cfg.TERMS_OF_SERVICE_URL.value);
    const version = await computeLegalVersion(privacy, terms);
    const required = ['true', '1'].includes(cfg.REQUIRE_POLICY_ACCEPTANCE.value);

    return { privacy, terms, version, requireAcceptance: required && version !== undefined };
  }

  /**
   * Whether a user with the given accepted version still has to accept the
   * current documents. False when acceptance is not required.
   */
  needsAcceptance(state: LegalState, acceptedVersion: string | null | undefined): boolean {
    return state.requireAcceptance && acceptedVersion !== state.version;
  }
}

export const legalService = new LegalService();
