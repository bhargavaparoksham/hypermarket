type SeedSummary = {
  created: string[];
};

async function main(): Promise<void> {
  const summary: SeedSummary = {
    created: []
  };

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      message: "Seed placeholder executed",
      summary
    })
  );
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      message: "Seed failed",
      error: error instanceof Error ? error.message : String(error)
    })
  );
  process.exit(1);
});
