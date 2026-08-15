import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { ForbiddenException } from '@nestjs/common';

const BLOCKED_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata',
  'instance-data',
  '169.254.169.254',
  '100.100.100.200',
]);

function ipv4ToInt(ip: string): number | null {
  const octets = ip.split('.').map((part) => Number(part));
  if (
    octets.length !== 4 ||
    octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) {
    return null;
  }
  return (
    (((octets[0]! << 24) >>> 0) +
      (octets[1]! << 16) +
      (octets[2]! << 8) +
      octets[3]!) >>>
    0
  );
}

function inCidr4(ipInt: number, base: string, maskBits: number): boolean {
  const baseInt = ipv4ToInt(base);
  if (baseInt === null) return false;
  const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

export function isBlockedIpAddress(ip: string, allowLoopback = false): boolean {
  const normalized = ip.toLowerCase().replace(/^::ffff:/, '');
  const version = isIP(normalized);
  if (version === 4) {
    const ipInt = ipv4ToInt(normalized);
    if (ipInt === null) return true;
    // Always block cloud metadata, unspecified, link-local, Carrier-Grade NAT, private RFC1918, multicast
    if (
      inCidr4(ipInt, '0.0.0.0', 8) ||
      inCidr4(ipInt, '169.254.0.0', 16) ||
      inCidr4(ipInt, '10.0.0.0', 8) ||
      inCidr4(ipInt, '172.16.0.0', 12) ||
      inCidr4(ipInt, '192.168.0.0', 16) ||
      inCidr4(ipInt, '100.64.0.0', 10) ||
      inCidr4(ipInt, '224.0.0.0', 4)
    ) {
      return true;
    }
    if (!allowLoopback && inCidr4(ipInt, '127.0.0.0', 8)) {
      return true;
    }
    return false;
  }
  if (version === 6) {
    if (normalized === '::') return true;
    if (normalized === '::1') return !allowLoopback;
    if (
      normalized.startsWith('fe80:') ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('ff')
    ) {
      return true;
    }
    return false;
  }
  return true;
}

export async function assertSafeOutboundUrl(
  rawUrl: string,
  options: { allowLoopback?: boolean; resolveDns?: boolean } = {},
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ForbiddenException('Outbound URL is invalid');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new ForbiddenException('Outbound protocol not permitted');
  }
  if (parsed.username || parsed.password) {
    throw new ForbiddenException('Outbound URL must not embed credentials');
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new ForbiddenException('Outbound destination blocked by SSRF policy');
  }
  const allowLoopback = Boolean(options.allowLoopback);
  if (!allowLoopback && hostname === 'localhost') {
    throw new ForbiddenException('Loopback destination blocked by SSRF policy');
  }
  if (isIP(hostname)) {
    if (isBlockedIpAddress(hostname, allowLoopback)) {
      throw new ForbiddenException('Outbound IP blocked by SSRF policy');
    }
    return parsed;
  }
  if (allowLoopback && hostname === 'localhost') {
    return parsed;
  }
  if (options.resolveDns !== false) {
    const records = await lookup(hostname, { all: true });
    if (!records.length) {
      throw new ForbiddenException('Outbound hostname could not be resolved');
    }
    for (const record of records) {
      if (isBlockedIpAddress(record.address, allowLoopback)) {
        throw new ForbiddenException(
          'Outbound DNS resolved to a restricted network range',
        );
      }
    }
  }
  return parsed;
}
