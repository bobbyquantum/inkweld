/**
 * JSON Schema for OpenAI response validation
 */
export const ParagraphCheckSchema = {
  type: 'object',
  required: ['original_paragraph', 'corrections', 'style_recommendations'],
  properties: {
    original_paragraph: {
      type: 'string',
      description: 'The original paragraph that was checked',
    },
    corrections: {
      type: 'array',
      description: 'List of text corrections with position information',
      items: {
        type: 'object',
        required: ['error', 'suggestion'],
        properties: {
          error: {
            type: 'string',
            description: 'The error text as it appears in the original paragraph',
          },
          suggestion: {
            type: 'string',
            description: 'The suggested correction for the error',
          },
          from: {
            type: 'number',
            description: 'The starting position of the error (UTF-16 code unit offset)',
          },
          to: {
            type: 'number',
            description: 'The ending position of the error (UTF-16 code unit offset)',
          },
        },
      },
    },
    style_recommendations: {
      type: 'array',
      description: 'List of style recommendations for the paragraph',
      items: {
        type: 'object',
        required: ['suggestion', 'reason'],
        properties: {
          suggestion: {
            type: 'string',
            description: 'The style recommendation for the paragraph',
          },
          reason: {
            type: 'string',
            description: 'The reason for the style recommendation',
          },
        },
      },
    },
  },
};
