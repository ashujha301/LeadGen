import { USER_AGENT } from "@/shared/config";

export type RobotsRule = {
  path: string;
  allowed: boolean;
};

export function parseRobotsTxt(content: string, userAgent = USER_AGENT): RobotsRule[] {
  const rules: RobotsRule[] = [];
  const lines = content.split("\n");
  let applies = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const [directive, ...rest] = line.split(":");
    const value = rest.join(":").trim();

    if (directive?.toLowerCase() === "user-agent") {
      applies = value === "*" || userAgent.includes(value);
    }

    if (!applies) continue;

    if (directive?.toLowerCase() === "allow") {
      rules.push({ path: value, allowed: true });
    } else if (directive?.toLowerCase() === "disallow") {
      rules.push({ path: value, allowed: false });
    }
  }

  return rules;
}

export function isPathAllowed(path: string, rules: RobotsRule[]): boolean {
  if (rules.length === 0) return true;

  const matching = rules.filter((rule) => path.startsWith(rule.path));
  if (matching.length === 0) return true;

  return matching[matching.length - 1]!.allowed;
}

export async function fetchRobotsTxt(baseUrl: string): Promise<RobotsRule[]> {
  const data = await fetchRobotsData(baseUrl);
  return data.rules;
}

export async function fetchRobotsData(
  baseUrl: string,
): Promise<{ rules: RobotsRule[]; rawContent: string }> {
  try {
    const robotsUrl = new URL("/robots.txt", baseUrl).toString();
    const response = await fetch(robotsUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      return { rules: [], rawContent: "" };
    }

    const content = await response.text();
    return {
      rules: parseRobotsTxt(content),
      rawContent: content,
    };
  } catch {
    return { rules: [], rawContent: "" };
  }
}
