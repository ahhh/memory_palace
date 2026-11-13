async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export const deflate = (bytes: Uint8Array) => pipe(bytes, new CompressionStream('deflate-raw'));
export const inflate = (bytes: Uint8Array) => pipe(bytes, new DecompressionStream('deflate-raw'));

export async function deflateJson(v: unknown): Promise<Uint8Array> {
  return deflate(new TextEncoder().encode(JSON.stringify(v)));
}
export async function inflateJson(bytes: Uint8Array): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await inflate(bytes)));
}
