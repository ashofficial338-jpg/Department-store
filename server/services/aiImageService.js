// Clean integration point for a future AI/image-recognition provider
// (e.g. an external vision API). No AI service is configured out of the box,
// so this honestly reports "unavailable" rather than fabricating extracted data.
//
// To wire up a real provider: set AI_IMAGE_PROVIDER + provider credentials in
// server/.env, then implement the branch below that calls the provider and
// maps its response onto the shape already used by the client
// (Product > Create from Image screen expects exactly this contract).

const PROVIDER = process.env.AI_IMAGE_PROVIDER || '';

export async function extractProductInfoFromImage(imageUrl) {
  if (!PROVIDER) {
    return {
      available: false,
      message: 'AI image recognition is not configured. Add an AI_IMAGE_PROVIDER integration in server/services/aiImageService.js to enable automatic extraction.',
      extracted: null,
    };
  }

  // Placeholder for a real provider call, intentionally left unimplemented
  // until a provider is configured, so the app never pretends to have AI it doesn't have.
  throw new Error(`AI image provider "${PROVIDER}" is not yet implemented.`);
}

export default { extractProductInfoFromImage };
