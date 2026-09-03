interface DatabaseConnection {
  select: (
    query: string,
    bindValues?: unknown[],
  ) => Promise<Array<Record<string, unknown>>>
}

interface DatabaseRoundTripDependencies {
  createProbe: () => string
  getDatabase: () => DatabaseConnection
  now: () => string
}

const writeAndReadProbe = `
  INSERT INTO foundation_health (id, probe, checked_at)
  VALUES (1, $1, $2)
  ON CONFLICT(id) DO UPDATE SET
    probe = excluded.probe,
    checked_at = excluded.checked_at
  RETURNING probe
`

export async function checkDatabaseRoundTrip(
  dependencies: DatabaseRoundTripDependencies,
): Promise<void> {
  const database = dependencies.getDatabase()
  const probe = dependencies.createProbe()
  const rows = await database.select(writeAndReadProbe, [
    probe,
    dependencies.now(),
  ])

  if (rows[0]?.probe !== probe) {
    throw new Error('SQLite round trip did not return the written probe')
  }
}
