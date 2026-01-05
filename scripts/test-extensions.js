import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import ExtensionExtra from '../lib/base/Extension.js';

const extensionsDir = path.resolve('extensions');
const testDataPath = path.resolve('scripts/test-data.json');

async function testExtensions() {
  if (!fs.existsSync(testDataPath)) {
    console.error('Error: scripts/test-data.json not found. Please create it with test URLs.');
    process.exit(1);
  }

  const extensionFiles = fs.readdirSync(extensionsDir).filter(f => f.endsWith('Extension.js'));
  const testData = JSON.parse(fs.readFileSync(testDataPath, 'utf8'));

  const specificExtension = process.argv[2];

  console.log('--- Horny Downloader Extension Test Suite ---');
  if (specificExtension) {
    console.log(`Running test for single extension: ${specificExtension}\n`);
  } else {
    console.log(`Found ${extensionFiles.length} extensions.\n`);
  }

  const results = [];

  for (const file of extensionFiles) {
    const extensionName = file.replace('.js', '');
    if (specificExtension && extensionName !== specificExtension && file !== specificExtension) continue;

    const url = testData[extensionName];

    process.stdout.write(`Testing [${extensionName}]... `);
    
    if (!url || url.includes('000000') || url.includes('/test') || url.includes('/video/12345')) {
      console.log('⚠️  SKIP (Placeholder or No URL)');
      results.push({ name: extensionName, status: 'SKIPPED', reason: 'No valid test URL' });
      continue;
    }

    try {
      const modulePath = pathToFileURL(path.join(extensionsDir, file)).href;
      const { default: ExtensionClass } = await import(modulePath);
      const extension = new ExtensionClass(ExtensionExtra);

      const response = await extension.extract(url);

      // Simple validation
      const issues = [];
     
      if (!response.title || response.title === 'Unknown Title') issues.push('Title missing');
      if (!response.thumb) issues.push('Thumbnail missing');
      if (!response.video_test) issues.push('Video source missing');
      if (!response.list_quality || response.list_quality.length === 0) issues.push('Quality list empty');
      
      if (issues.length === 0) {
        console.log('✅ PASS');
        console.log(`   - Title: ${response.title}`);
        console.log(`   - Quality Count: ${response.list_quality.length}`);
        console.log(`   - Duration: ${response.time}`);
        results.push({ name: extensionName, status: 'PASS', data: response });
      } else {
        console.log(`❌ FAIL (${issues.join(', ')})`);
        results.push({ name: extensionName, status: 'FAIL', reason: issues.join(', '), data: response });
      }
    } catch (error) {
      console.log(`💥 ERROR: ${error.message}`);
      // Show snippet of where it failed if it's a syntax error in extraction
      results.push({ name: extensionName, status: 'ERROR', reason: error.message });
    }
  }

  console.log('\n--- Test Summary ---');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL' || r.status === 'ERROR').length;
  const skipped = results.filter(r => r.status === 'SKIPPED').length;

  console.log(`Total: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Skipped: ${skipped}`);

  if (failed > 0 && !specificExtension) {
    console.log('\nHint: Use a real working URL in scripts/test-data.json to get a PASS.');
  }
}

testExtensions().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
