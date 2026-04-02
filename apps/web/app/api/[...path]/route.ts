import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const DEFAULT_PROXY_TARGET = "https://prof-api-883486567270.europe-west2.run.app";

type ProxyRouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

async function getProxyTarget() {
  const { env } = await getCloudflareContext({ async: true });
  const bindingValue = (env as Record<string, unknown>).API_PROXY_TARGET;
  const value =
    (typeof bindingValue === "string" ? bindingValue : process.env.API_PROXY_TARGET ?? DEFAULT_PROXY_TARGET)?.trim();

  return value ? value.replace(/\/$/, "") : null;
}

async function buildUpstreamUrl(request: NextRequest) {
  const proxyTarget = await getProxyTarget();

  if (!proxyTarget) {
    return null;
  }

  const incomingUrl = new URL(request.url);
  return new URL(`${incomingUrl.pathname}${incomingUrl.search}`, `${proxyTarget}/`);
}

function buildUpstreamRequestHeaders(request: NextRequest) {
  const incomingUrl = new URL(request.url);
  const headers = new Headers(request.headers);

  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }

  headers.set("x-forwarded-host", incomingUrl.host);
  headers.set("x-forwarded-proto", incomingUrl.protocol.replace(/:$/, ""));

  return headers;
}

function buildDownstreamResponseHeaders(upstreamResponse: Response) {
  const headers = new Headers();

  upstreamResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie" || HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      return;
    }

    headers.append(key, value);
  });

  const getSetCookie = (
    upstreamResponse.headers as Headers & {
      getSetCookie?: () => string[];
    }
  ).getSetCookie;

  if (typeof getSetCookie === "function") {
    for (const cookie of getSetCookie.call(upstreamResponse.headers)) {
      headers.append("set-cookie", cookie);
    }
  } else {
    const setCookie = upstreamResponse.headers.get("set-cookie");

    if (setCookie) {
      headers.append("set-cookie", setCookie);
    }
  }

  return headers;
}

async function proxyRequest(request: NextRequest) {
  const upstreamUrl = await buildUpstreamUrl(request);

  if (!upstreamUrl) {
    return Response.json(
      {
        error: "API proxy is not configured. Set API_PROXY_TARGET in the web runtime environment.",
      },
      {
        status: 503,
      },
    );
  }

  const requestInit: RequestInit & {
    duplex?: "half";
  } = {
    method: request.method,
    headers: buildUpstreamRequestHeaders(request),
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    cache: "no-store",
    redirect: "manual",
    duplex: request.method === "GET" || request.method === "HEAD" ? undefined : "half",
    signal: request.signal,
  };

  const upstreamResponse = await fetch(upstreamUrl, requestInit);

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: buildDownstreamResponseHeaders(upstreamResponse),
  });
}

export async function GET(request: NextRequest, _context: ProxyRouteContext) {
  return proxyRequest(request);
}

export async function POST(request: NextRequest, _context: ProxyRouteContext) {
  return proxyRequest(request);
}

export async function PUT(request: NextRequest, _context: ProxyRouteContext) {
  return proxyRequest(request);
}

export async function PATCH(request: NextRequest, _context: ProxyRouteContext) {
  return proxyRequest(request);
}

export async function DELETE(request: NextRequest, _context: ProxyRouteContext) {
  return proxyRequest(request);
}

export async function HEAD(request: NextRequest, _context: ProxyRouteContext) {
  return proxyRequest(request);
}

export async function OPTIONS(request: NextRequest, _context: ProxyRouteContext) {
  return proxyRequest(request);
}
