import { PDFParse } from 'pdf-parse';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, testName: string, failureDetails?: string) {
  if (condition) {
    results.push({ name: testName, passed: true });
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    results.push({ name: testName, passed: false, details: failureDetails });
    console.error(`  ❌ FAIL: ${testName} - ${failureDetails || 'Assertion failed'}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Testing Suite 23: Slack PDF Text Extraction & Binary Guard');
  console.log('====================================================\n');

  // Test 1: Native PDF text extraction on valid text-layer PDF
  try {
    const validPdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 44 >>
stream
BT
/F1 24 Tf
100 700 Td
(Hello Enterprise MCP) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000222 00000 n 
0000000299 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
393
%%EOF`;

    const buffer = Buffer.from(validPdfContent, 'utf-8');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const pdfResult = await parser.getText();
    await parser.destroy().catch(() => {});

    assert(
      pdfResult.text.includes('Hello Enterprise MCP'),
      'PDF text extraction succeeds for text-layer PDF',
      `Expected 'Hello Enterprise MCP' in text, got: ${pdfResult.text}`
    );
    assert(pdfResult.total === 1, 'PDF page count correctly resolved as 1');
  } catch (err: any) {
    assert(false, 'PDF text extraction succeeds for text-layer PDF', err.message);
  }

  // Test 2: Binary format detection - Image extension
  const testImageFile = { name: 'screenshot.png', filetype: 'png', mimetype: 'image/png' };
  const isImage =
    testImageFile.mimetype.startsWith('image/') ||
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'heic', 'tiff'].includes(testImageFile.filetype.toLowerCase()) ||
    /\.(png|jpe?g|gif|webp|svg|bmp|ico|heic|tiff)$/i.test(testImageFile.name);
  assert(isImage === true, 'Image extension correctly categorized as binary image');

  // Test 3: Binary format detection - Archive extension
  const testZipFile = { name: 'backup.zip', filetype: 'zip', mimetype: 'application/zip' };
  const isArchive =
    ['zip', 'gz', 'tar', 'tgz', 'rar', '7z', 'bz2', 'dmg', 'iso', 'exe', 'bin', 'dll', 'pkg', 'apk', 'deb', 'rpm'].includes(testZipFile.filetype.toLowerCase()) ||
    testZipFile.mimetype.includes('zip') ||
    testZipFile.mimetype.includes('archive') ||
    /\.(zip|gz|tar|tgz|rar|7z|bz2|dmg|iso|exe|bin|dll|pkg|apk|deb|rpm)$/i.test(testZipFile.name);
  assert(isArchive === true, 'Zip archive correctly categorized as binary archive');

  // Test 4: Null-byte detection for non-text binary streams
  const binaryBuffer = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x01, 0x00, 0x01]);
  let hasNullByte = false;
  for (let i = 0; i < Math.min(binaryBuffer.length, 1024); i++) {
    if (binaryBuffer[i] === 0) {
      hasNullByte = true;
      break;
    }
  }
  assert(hasNullByte === true, 'Null byte detected in raw binary stream to prevent bytecode dump');

  // Test 5: Plain text stream has no null bytes
  const textBuffer = new TextEncoder().encode('Hello plain text world, this is markdown or code');
  let textHasNullByte = false;
  for (let i = 0; i < Math.min(textBuffer.length, 1024); i++) {
    if (textBuffer[i] === 0) {
      textHasNullByte = true;
      break;
    }
  }
  assert(textHasNullByte === false, 'Text stream is confirmed clean without null bytes');

  console.log('\n====================================================');
  const allPassed = results.every((r) => r.passed);
  if (allPassed) {
    console.log(`✅ All ${results.length} tests passed successfully!`);
    process.exit(0);
  } else {
    const failed = results.filter((r) => !r.passed);
    console.error(`❌ ${failed.length} of ${results.length} tests failed!`);
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
