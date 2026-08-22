/**
 * PostgREST returns/accepts `bytea` columns as Postgres "hex format"
 * text: a `\x` prefix followed by hex digits. Both directions need
 * this conversion — it isn't automatic through Supabase's JS client.
 */
export function bufferToPgBytea(buf: Buffer): string {
  return "\\x" + buf.toString("hex");
}

export function pgByteaToBuffer(value: string): Buffer {
  return Buffer.from(value.replace(/^\\x/, ""), "hex");
}
