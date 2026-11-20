import { createAgent, type EngineDeps, type EventBus, type MobileBuilder, type MobilePlatform } from "@theseus/core";
import { createKaneClient } from "@theseus/kane";

function isMobileModule(value: unknown): value is { buildExpo: MobileBuilder["buildExpo"]; ensureDevice: MobileBuilder["ensureDevice"] } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.buildExpo === "function" && typeof record.ensureDevice === "function";
}

/**
 * @theseus/mobile is optional: web-only voyages work without it. It is resolved at
 * runtime so the CLI builds and installs whether or not that package is present.
 */
export async function loadMobileBuilder(): Promise<MobileBuilder | undefined> {
  const specifier = "@theseus/mobile";
  let mod: unknown;
  try {
    mod = await import(specifier);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ERR_MODULE_NOT_FOUND") return undefined;
    throw error;
  }
  if (!isMobileModule(mod)) throw new Error("@theseus/mobile does not export buildExpo and ensureDevice");
  return {
    buildExpo: (workdir: string, platform: MobilePlatform) => mod.buildExpo(workdir, platform),
    ensureDevice: (platform: MobilePlatform) => mod.ensureDevice(platform),
  };
}

export async function createEngineDeps(bus: EventBus, needsMobile: boolean): Promise<EngineDeps> {
  const mobile = needsMobile ? await loadMobileBuilder() : undefined;
  return {
    kane: createKaneClient(),
    bus,
    createAgent,
    ...(mobile === undefined ? {} : { mobile }),
  };
}
