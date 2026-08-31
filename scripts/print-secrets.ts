import 'dotenv/config';
import { getMcpAuthConfig } from '../src/config/authConfig.js';

async function main() {
  console.log('====================================================');
  console.log('🔐 Fetching MCP Server Auth Secrets from Google Cloud');
  console.log('====================================================\n');

  try {
    const config = await getMcpAuthConfig();

    console.log('Use these credentials to configure Google Gemini Enterprise or your client:\n');
    console.log(`  Client ID     : ${config.clientId}`);
    console.log(`  Client Secret : ${config.clientSecret}`);
    console.log(`  Allowed URIs  : ${config.allowedRedirectUris.join(', ')}`);
    console.log(`  Token TTL     : ${config.tokenTtlSec}s (1 hour)`);
    console.log(`  Auth Code TTL : ${config.codeTtlSec}s (10 mins)\n`);
    console.log('====================================================');
  } catch (error: any) {
    console.error('❌ Failed to fetch MCP Auth secrets:');
    console.error(error.message || error);
    process.exit(1);
  }
}

main();
