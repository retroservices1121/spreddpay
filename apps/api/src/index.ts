import { createAppContext } from "./context";
import { buildServer } from "./server";
import { hydrateMockRain } from "./services/mock-hydration";

async function main(): Promise<void> {
  const context = createAppContext();
  const app = await buildServer(context);

  if (context.env.RAIN_MODE === "mock") {
    const restored = await hydrateMockRain(context.db, context.rain);
    app.log.info({ restored }, "restored provider references into mock Rain");
  }

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    await context.db.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ port: context.env.PORT, host: "0.0.0.0" });
  app.log.info(
    { rainMode: context.env.RAIN_MODE, blendMode: context.env.BLEND_MODE },
    "Spredd Pay API ready",
  );
}

main().catch((error) => {
  console.error("Failed to start Spredd Pay API:", error);
  process.exit(1);
});
