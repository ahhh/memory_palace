import { SCHEMA_VERSION, type PalaceDoc } from './schema';

/** Upgrade any older schema to the current one. Add steps as the schema evolves. */
export function migrate(doc: PalaceDoc): PalaceDoc {
  if (doc.schema !== SCHEMA_VERSION) throw new Error(`Unknown schema ${String(doc.schema)}`);
  return doc;
}
