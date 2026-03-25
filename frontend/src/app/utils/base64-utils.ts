/**
 * Convert a base64 string or data URL to a Blob.
 * Handles both raw base64 strings and data URLs (e.g., "data:image/png;base64,...").
 */
export function base64ToBlob(base64Data: string): Blob {
  const base64String = base64Data.includes(',')
    ? base64Data.split(',')[1]
    : base64Data;
  const byteCharacters = atob(base64String);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.codePointAt(i)!;
  }
  const byteArray = new Uint8Array(byteNumbers);

  let mimeType = 'image/png';
  if (base64Data.startsWith('data:')) {
    const mimeMatch = /data:([^;]+);/.exec(base64Data);
    if (mimeMatch) {
      mimeType = mimeMatch[1];
    }
  }

  return new Blob([byteArray], { type: mimeType });
}
