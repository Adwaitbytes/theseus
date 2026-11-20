import { join } from "node:path";
import { MobileError } from "./errors.js";
import type { System } from "./system.js";

export interface AndroidSdk {
  readonly root: string;
  readonly adb: string;
  readonly emulator: string;
  /** `aapt` from the newest installed build-tools, used to read the package id out of an APK. */
  readonly aapt: string | undefined;
}

export function resolveAndroidSdk(sys: System): AndroidSdk {
  const candidates = [
    sys.env.ANDROID_HOME,
    sys.env.ANDROID_SDK_ROOT,
    join(sys.homeDir, "Library", "Android", "sdk"),
  ].filter((path): path is string => path !== undefined && path.length > 0);
  const root = candidates.find((path) => sys.exists(join(path, "platform-tools")));
  if (root === undefined) {
    throw new MobileError(
      "android-sdk-missing",
      `no Android SDK found (looked in ${candidates.join(", ")})`,
      "Install Android Studio or the command-line SDK, then set ANDROID_HOME to the SDK root (default ~/Library/Android/sdk).",
    );
  }
  const adb = join(root, "platform-tools", "adb");
  const emulator = join(root, "emulator", "emulator");
  if (!sys.exists(adb)) {
    throw new MobileError("android-sdk-missing", `adb is missing at ${adb}`, 'Install platform-tools: sdkmanager "platform-tools".');
  }
  const buildTools = newestVersionDir(sys.listDir(join(root, "build-tools")));
  const aapt = buildTools === undefined ? undefined : join(root, "build-tools", buildTools, "aapt");
  return { root, adb, emulator, aapt: aapt !== undefined && sys.exists(aapt) ? aapt : undefined };
}

/** Picks the highest stable dotted version from directory names such as `35.0.0`, ignoring previews like `36.0.0-rc1`. */
export function newestVersionDir(names: readonly string[]): string | undefined {
  const parse = (name: string) => name.split(".").map(Number);
  return [...names]
    .filter((name) => /^\d+(\.\d+)*$/.test(name))
    .sort((a, b) => {
      const pa = parse(a);
      const pb = parse(b);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (diff !== 0) return diff;
      }
      return 0;
    })
    .at(-1);
}

/** React Native's Gradle plugin needs JDK 17; newer JDKs fail on the bundled Gradle version. */
export function resolveJavaHome(sys: System): string {
  const candidates = [
    sys.env.THESEUS_JAVA_HOME,
    sys.env.JAVA_HOME,
    "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home",
    "/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home",
    "/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home",
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
  ].filter((path): path is string => path !== undefined && path.length > 0);
  const home = candidates.find((path) => sys.exists(join(path, "bin", "java")));
  if (home === undefined) {
    throw new MobileError(
      "java-missing",
      `no JDK found (looked in ${candidates.join(", ")})`,
      "Install JDK 17 (brew install openjdk@17) or set THESEUS_JAVA_HOME to a JDK 17 home.",
    );
  }
  return home;
}
