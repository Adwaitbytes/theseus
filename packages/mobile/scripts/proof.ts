/**
 * End-to-end proof without Kane: boot the device, build the fixture as a release artifact,
 * install it fresh, launch it with no Metro server running, and screenshot the result.
 *
 *   pnpm --filter @theseus/mobile proof android ios
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import {
  buildExpo,
  captureScreenshot,
  ensureDevice,
  installApp,
  isMobileError,
  launchApp,
  type LogLine,
  type MobilePlatform,
  uninstallApp,
} from "../src/index.js";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = join(packageDir, "fixtures", "expo-hello");
const proofDir = join(packageDir, "proof");
const LAUNCH_SETTLE_MS = 8_000;

function isPlatform(value: string): value is MobilePlatform {
  return value === "android" || value === "ios";
}

const progress = (line: LogLine) => {
  if (line.stream === "info") process.stdout.write(`[${line.source}] ${line.text}\n`);
};

async function prove(platform: MobilePlatform) {
  const t0 = Date.now();
  const device = await ensureDevice(platform, { onLog: progress });
  const bootMs = Date.now() - t0;
  const build = await buildExpo(fixture, platform, { onLog: progress });
  await uninstallApp(platform, build.appId, { deviceId: device.deviceId, onLog: progress });
  const t1 = Date.now();
  await installApp(platform, build.appPath, { deviceId: device.deviceId, onLog: progress });
  await launchApp(platform, build.appId, { deviceId: device.deviceId, onLog: progress });
  await delay(LAUNCH_SETTLE_MS);
  const screenshot = join(proofDir, `${platform}-launch.png`);
  await captureScreenshot(platform, screenshot, { deviceId: device.deviceId });
  return {
    platform,
    device,
    appId: build.appId,
    artifact: relative(packageDir, build.appPath),
    deviceReadyS: Math.round(bootMs / 1000),
    buildS: Math.round(build.durationMs / 1000),
    installAndLaunchS: Math.round((Date.now() - t1) / 1000),
    screenshot: relative(packageDir, screenshot),
    at: new Date().toISOString(),
  };
}

const platforms = process.argv.slice(2);
if (platforms.length === 0 || !platforms.every(isPlatform)) {
  process.stderr.write("usage: proof.ts android|ios [android|ios]\n");
  process.exit(2);
}

await mkdir(proofDir, { recursive: true });
for (const platform of platforms) {
  try {
    const result = await prove(platform);
    await writeFile(join(proofDir, `${platform}.json`), `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    if (isMobileError(error)) {
      process.stderr.write(`${error.code}: ${error.message}\nremedy: ${error.remedy}\n${error.logTail}\n`);
    }
    throw error;
  }
}
