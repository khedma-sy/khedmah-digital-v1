import { readFile } from 'node:fs/promises';
const [path, expectedOrigin] = process.argv.slice(2);
if (!path || !expectedOrigin) throw new Error('Header path and expected origin are required.');
const headers = await readFile(path, 'utf8');
const finalResponse = headers.split(/\r?\n\r?\n/).filter(block => /^HTTP\/\S+ \d{3}/.test(block)).at(-1) ?? '';
if (!/^HTTP\/\S+ 2\d\d/.test(finalResponse)) throw new Error('CORS preflight did not return a successful final response.');
const values = (name) => finalResponse.split(/\r?\n/).filter(line => line.toLowerCase().startsWith(`${name}:`)).map(line => line.slice(line.indexOf(':') + 1).trim());
const origins = values('access-control-allow-origin');
const credentials = values('access-control-allow-credentials');
if (origins.length !== 1 || origins[0] !== expectedOrigin || credentials.length !== 1 || credentials[0] !== 'true') {
  throw new Error('Isolated frontend CORS preflight does not allow its exact credentialed origin.');
}
console.log('Isolated frontend credentialed origin verified.');
