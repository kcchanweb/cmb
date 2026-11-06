// Read-only probe: no event sends, resets, or vendor control changes.
try {
  const base = new URL(process.env.VENDOR_BASE_URL ?? 'http://host.docker.internal:9000');
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password ||
      base.pathname !== '/' || base.search || base.hash) {
    throw new Error('Invalid vendor base URL');
  }
  const response = await fetch(new URL('/_stats', base), {
    signal: AbortSignal.timeout(3000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Vendor probe HTTP failure');
  const stats = await response.json();
  if (stats?.config?.strict !== true) throw new Error('Strict validation is disabled');
  console.log(JSON.stringify({ vendorReachable: true, strict: true }));
} catch {
  console.error('Vendor check failed. Start the strict host vendor and verify the container-to-host route.');
  process.exitCode = 1;
}
