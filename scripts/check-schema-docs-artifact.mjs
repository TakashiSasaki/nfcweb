import {readFile, access} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function checkArtifact(site = resolve('_site')) {
  const identity = JSON.parse(await readFile(join(site, 'site-version.json'), 'utf8'));
  if (!/^(?:[a-f0-9]{40}|local)$/.test(identity.revision) || !Number.isFinite(Date.parse(identity.builtAt))) throw Error('Invalid site identity');
  const assetVersion = `${identity.revision}-${identity.builtAt}`;
  const checkAsset = (url, file) => {
    if (new URL(url, 'https://example.org/').searchParams.get('build') !== assetVersion) throw Error(`${file}: asset identity mismatch`);
  };
  for (const page of ['index.html', 'schema.html', 'source.html']) {
    const html = await readFile(join(site, page), 'utf8');
    for (const [name, value] of [['nfcweb-build-revision', identity.revision], ['nfcweb-built-at', identity.builtAt]]) {
      if (!html.includes(`<meta name="${name}" content="${value}">`)) throw Error(`${page}: inconsistent ${name}`);
    }
    if (/__(?:BUILD_REVISION|BUILT_AT)__/.test(html)) throw Error(`${page}: unresolved build placeholder`);
    if (!html.includes('id="documentation-freshness"')) throw Error(`${page}: missing indicator`);
    for (const [, url] of html.matchAll(/(?:src|href)="([^" ]+\.(?:js|css)(?:\?[^" ]*)?)"/g)) checkAsset(url, page);
  }
  const worker = await readFile(join(site, 'service-worker.js'), 'utf8');
  if (!worker.includes(`revision: '${identity.revision}', builtAt: '${identity.builtAt}'`)) throw Error('Worker identity mismatch');
  for (const file of ['schema-tabs.js', 'documentation-freshness.js', 'service-worker-register.js', 'schema-manifest.json']) await access(join(site, file));
  for (const file of ['schema-browser.js', 'source-browser.js', 'documentation-freshness.js']) {
    const source = await readFile(join(site, file), 'utf8');
    for (const [, url] of source.matchAll(/(?:from\s+|import\s*)['"](\.\/[^'"]+\.js(?:\?[^'"]*)?)['"]/g)) checkAsset(url, file);
  }
  return identity;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log('Pages artifact verified:', await checkArtifact());
}
