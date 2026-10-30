import path from "node:path";

/** Сообщение, если нет ни системного канала, ни встроенного Chromium. */
export const E2E_BROWSER_MISSING_MESSAGE =
  "Не найден Google Chrome. Установите его или задайте E2E_BROWSER_CHANNEL / выполните pnpm exec playwright install chromium";

export const DEFAULT_E2E_BROWSER_CHANNEL = "chrome";
export const BUNDLED_CHROMIUM_CHANNEL = "chromium";

type ChannelPaths = {
  linux: string;
  darwin: string;
  win32: string;
};

/** Те же пути, что Playwright ищет для channel (playwright-core registry). */
const CHANNEL_PATHS: Record<string, ChannelPaths> = {
  chrome: {
    linux: "/opt/google/chrome/chrome",
    darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    win32: "\\Google\\Chrome\\Application\\chrome.exe",
  },
  "chrome-beta": {
    linux: "/opt/google/chrome-beta/chrome",
    darwin: "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
    win32: "\\Google\\Chrome Beta\\Application\\chrome.exe",
  },
  "chrome-dev": {
    linux: "/opt/google/chrome-unstable/chrome",
    darwin: "/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev",
    win32: "\\Google\\Chrome Dev\\Application\\chrome.exe",
  },
  "chrome-canary": {
    linux: "/opt/google/chrome-canary/chrome",
    darwin: "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    win32: "\\Google\\Chrome SxS\\Application\\chrome.exe",
  },
  msedge: {
    linux: "/opt/microsoft/msedge/msedge",
    darwin: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    win32: "\\Microsoft\\Edge\\Application\\msedge.exe",
  },
  "msedge-beta": {
    linux: "/opt/microsoft/msedge-beta/msedge",
    darwin: "/Applications/Microsoft Edge Beta.app/Contents/MacOS/Microsoft Edge Beta",
    win32: "\\Microsoft\\Edge Beta\\Application\\msedge.exe",
  },
  "msedge-dev": {
    linux: "/opt/microsoft/msedge-dev/msedge",
    darwin: "/Applications/Microsoft Edge Dev.app/Contents/MacOS/Microsoft Edge Dev",
    win32: "\\Microsoft\\Edge Dev\\Application\\msedge.exe",
  },
  "msedge-canary": {
    linux: "",
    darwin: "/Applications/Microsoft Edge Canary.app/Contents/MacOS/Microsoft Edge Canary",
    win32: "\\Microsoft\\Edge SxS\\Application\\msedge.exe",
  },
};

export type ResolveE2EBrowserInput = {
  envValue: string | undefined;
  platform: NodeJS.Platform;
  fileExists: (absolutePath: string) => boolean;
  bundledChromiumPath: string | undefined;
  env?: NodeJS.Dict<string>;
};

export type ResolvedE2EBrowser = {
  /** Канал Playwright; отсутствует для встроенного Chromium. */
  channel?: string;
  message: string;
};

export function requestedE2EBrowserChannel(raw: string | undefined): string {
  if (raw === undefined || raw.trim().length === 0) {
    return DEFAULT_E2E_BROWSER_CHANNEL;
  }
  return raw.trim();
}

function win32Prefixes(env: NodeJS.Dict<string> | undefined): string[] {
  const homedrive = env?.["HOMEDRIVE"] ?? "";
  const values = [
    env?.["LOCALAPPDATA"],
    env?.["PROGRAMFILES"],
    env?.["PROGRAMFILES(X86)"],
    homedrive.length > 0 ? `${homedrive}\\Program Files` : undefined,
    homedrive.length > 0 ? `${homedrive}\\Program Files (x86)` : undefined,
  ];
  return values.filter((value): value is string => value !== undefined && value.length > 0);
}

function channelCandidatePaths(
  channel: string,
  platform: NodeJS.Platform,
  env: NodeJS.Dict<string> | undefined,
): string[] {
  const spec = CHANNEL_PATHS[channel];
  if (spec === undefined) {
    return [];
  }
  if (platform === "linux") {
    return spec.linux.length > 0 ? [spec.linux] : [];
  }
  if (platform === "darwin") {
    return spec.darwin.length > 0 ? [spec.darwin] : [];
  }
  if (platform === "win32") {
    return win32Prefixes(env).map((prefix) => path.join(prefix, spec.win32));
  }
  return [];
}

function channelExists(input: ResolveE2EBrowserInput, channel: string): boolean {
  return channelCandidatePaths(channel, input.platform, input.env).some((candidate) =>
    input.fileExists(candidate),
  );
}

function bundledAvailable(input: ResolveE2EBrowserInput): boolean {
  const bundled = input.bundledChromiumPath;
  return bundled !== undefined && bundled.length > 0 && input.fileExists(bundled);
}

function bundledResult(message: string): ResolvedE2EBrowser {
  return { message };
}

/**
 * Пусто / не задано → канал chrome. Если канала нет, а встроенный Chromium установлен — его.
 * Иначе русская ошибка без стектрейса Playwright.
 */
export function resolveE2EBrowser(input: ResolveE2EBrowserInput): ResolvedE2EBrowser {
  const requested = requestedE2EBrowserChannel(input.envValue);

  if (requested === BUNDLED_CHROMIUM_CHANNEL) {
    if (bundledAvailable(input)) {
      return bundledResult("e2e: браузер — встроенный Chromium (E2E_BROWSER_CHANNEL=chromium)");
    }
    throw new Error(E2E_BROWSER_MISSING_MESSAGE);
  }

  if (channelExists(input, requested)) {
    const label = requested === DEFAULT_E2E_BROWSER_CHANNEL ? "Google Chrome" : `канал ${requested}`;
    return { channel: requested, message: `e2e: браузер — ${label}` };
  }

  if (bundledAvailable(input)) {
    const reason =
      requested === DEFAULT_E2E_BROWSER_CHANNEL
        ? "Google Chrome не найден"
        : `канал ${requested} не найден`;
    return bundledResult(`e2e: ${reason}, использую встроенный Chromium`);
  }

  throw new Error(E2E_BROWSER_MISSING_MESSAGE);
}
