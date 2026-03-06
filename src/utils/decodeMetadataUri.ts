const b64ToBytes = (b64: string): Uint8Array =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

const inflateWithDecompressionStream = async (bytes: Uint8Array): Promise<Uint8Array> => {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream is not available');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
};

export async function decodeMetadataUri(rawUri: string): Promise<any> {
  if (!rawUri || typeof rawUri !== 'string' || !rawUri.includes(',')) return rawUri;

  const [header, b64] = rawUri.split(',', 2);
  const bytes = b64ToBytes(b64);

  let jsonText: string;
  if (header.includes('application/json+zlib')) {
    const inflated = await inflateWithDecompressionStream(bytes);
    jsonText = new TextDecoder().decode(inflated);
  } else if (header.includes('application/json')) {
    jsonText = new TextDecoder().decode(bytes);
  } else {
    throw new Error(`Unsupported metadata URI header: ${header}`);
  }

  return JSON.parse(jsonText);
}
