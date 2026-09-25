import { addRxPlugin, type MigrationStrategies, type RxJsonSchema } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';

/**
 * The collection config for a connector schema: the schema plus a `v => null`
 * strategy for every version from 1 to N (`{}` at version 0), so a version
 * bump drops the documents and replication resyncs them (see ConnectorSchemas).
 *
 * Use this for any connector collection created outside `createTallyDatabase`
 * (tests, an app's own database). A connector schema above version 0 needs
 * these strategies and the migration plugin, or RxDB throws COL12 or
 * "plugin missing". Never for local-only collections (`stock_levels`,
 * `pos_orders`): a drop would lose local data.
 */
export function connectorCollection<T>(schema: RxJsonSchema<T>): { schema: RxJsonSchema<T>; migrationStrategies: MigrationStrategies } {
  // addRxPlugin ignores a plugin it already has.
  addRxPlugin(RxDBMigrationSchemaPlugin);
  const migrationStrategies = Object.fromEntries(Array.from({ length: schema.version }, (_, i) => [i + 1, () => null]));
  return { schema, migrationStrategies };
}
