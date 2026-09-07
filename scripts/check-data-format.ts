import fs from 'node:fs';
import path from 'node:path';
import {
  loadCanonicalSchemas,
  buildNfcTagBundle,
  buildNfcTagRegistryBundle,
  generateTypeScriptCode
} from './generate-data-format';

async function check() {
  const { ndefSchema, tagSchema, registrySchema } = loadCanonicalSchemas();

  const BUNDLES_DIR = path.resolve('src/data-format/generated/bundles');
  const OUTPUT_TS_PATH = path.resolve('src/data-format/generated/nfcweb-tag-registry.ts');

  // Check bundles exist and match
  const tagBundlePath = path.join(BUNDLES_DIR, 'nfc-tag.bundle.json');
  const registryBundlePath = path.join(BUNDLES_DIR, 'nfc-tag-registry.bundle.json');

  if (!fs.existsSync(tagBundlePath) || !fs.existsSync(registryBundlePath)) {
    console.error('Generated schema bundles missing. Run npm run generate:data-format.');
    process.exit(1);
  }

  const expectedTagBundle = JSON.stringify(buildNfcTagBundle(tagSchema, ndefSchema), null, 2) + '\n';
  const actualTagBundle = fs.readFileSync(tagBundlePath, 'utf8');
  if (expectedTagBundle.trim() !== actualTagBundle.trim()) {
    console.error(`DRIFT DETECTED: ${tagBundlePath} is out of sync with canonical schemas.`);
    console.error("Run 'npm run generate:data-format' to synchronize.");
    process.exit(1);
  }

  const expectedRegistryBundle = JSON.stringify(buildNfcTagRegistryBundle(registrySchema, tagSchema, ndefSchema), null, 2) + '\n';
  const actualRegistryBundle = fs.readFileSync(registryBundlePath, 'utf8');
  if (expectedRegistryBundle.trim() !== actualRegistryBundle.trim()) {
    console.error(`DRIFT DETECTED: ${registryBundlePath} is out of sync with canonical schemas.`);
    console.error("Run 'npm run generate:data-format' to synchronize.");
    process.exit(1);
  }

  // Check generated TypeScript
  if (!fs.existsSync(OUTPUT_TS_PATH)) {
    console.error(`Generated artifact not found at ${OUTPUT_TS_PATH}. Run 'npm run generate:data-format'.`);
    process.exit(1);
  }

  const expectedTs = await generateTypeScriptCode(registrySchema, tagSchema, ndefSchema);
  const actualTs = fs.readFileSync(OUTPUT_TS_PATH, 'utf8');

  const normExpected = expectedTs.replace(/\r\n/g, '\n').trim();
  const normActual = actualTs.replace(/\r\n/g, '\n').trim();

  if (normExpected !== normActual) {
    console.error(`DRIFT DETECTED: ${OUTPUT_TS_PATH} is out of sync with canonical schemas.`);
    console.error("Please run 'npm run generate:data-format' to synchronize the generated types.");
    process.exit(1);
  }

  console.log('PASS: Generated bundles and TypeScript types are strictly in sync with canonical JSON schemas.');
}

check().catch((err) => {
  console.error('Check failed with error:', err);
  process.exit(1);
});
