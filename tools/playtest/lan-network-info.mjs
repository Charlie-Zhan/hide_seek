import { networkInterfaces } from 'node:os';

export function getLanIpv4Addresses() {
  const addresses = [];

  for (const [adapterName, entries] of Object.entries(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) {
        continue;
      }

      addresses.push({
        adapterName,
        address: entry.address,
        endpoint: `ws://${entry.address}:`,
        isLikelyPhysicalLan: isLikelyPhysicalLanAddress(adapterName, entry.address)
      });
    }
  }

  return dedupeAddresses(addresses).sort((a, b) => {
    if (a.isLikelyPhysicalLan !== b.isLikelyPhysicalLan) {
      return a.isLikelyPhysicalLan ? -1 : 1;
    }

    return a.address.localeCompare(b.address);
  });
}

export function formatLanWebSocketEndpoints(port) {
  return getLanIpv4Addresses().map((entry) => ({
    ...entry,
    endpoint: `ws://${entry.address}:${port}`
  }));
}

export function printLanWebSocketEndpoints({ port, heading = 'LAN WebSocket endpoints for same-Wi-Fi phones:' }) {
  const endpoints = formatLanWebSocketEndpoints(port);

  console.log(heading);
  if (endpoints.length === 0) {
    console.log('- No non-internal IPv4 address detected. Check Wi-Fi/Ethernet connection.');
    return endpoints;
  }

  for (const endpoint of endpoints) {
    const hint = endpoint.isLikelyPhysicalLan ? ' likely same-Wi-Fi/LAN' : '';
    console.log(`- ${endpoint.endpoint} (${endpoint.adapterName}${hint})`);
  }

  return endpoints;
}

function dedupeAddresses(entries) {
  const seen = new Set();
  const result = [];

  for (const entry of entries) {
    if (seen.has(entry.address)) {
      continue;
    }

    seen.add(entry.address);
    result.push(entry);
  }

  return result;
}

function isLikelyPhysicalLanAddress(adapterName, address) {
  const name = adapterName.toLowerCase();
  if (name.includes('docker') || name.includes('wsl') || name.includes('vethernet') || name.includes('tailscale')) {
    return false;
  }

  return /^192\.168\./.test(address) || /^10\./.test(address) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(address);
}
