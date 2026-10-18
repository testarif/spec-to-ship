const os = require('os');
const path = require('path');
const fs = require('fs');
const assert = require('assert/strict');
const { safeWrite } = require('./server/pipeline');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-to-ship-safe-write-'));
const workspace = path.join(tempRoot, 'run');
const escapedSibling = path.join(tempRoot, 'run-escape', 'pwned.txt');

try {
  fs.mkdirSync(workspace);

  assert.throws(
    () => safeWrite(workspace, '../run-escape/pwned.txt', 'outside'),
    /Invalid file path/,
    'should reject a sibling path sharing the workspace prefix'
  );
  assert.equal(fs.existsSync(escapedSibling), false, 'must not create files outside the workspace');

  safeWrite(workspace, 'nested/result.txt', 'inside');
  assert.equal(fs.readFileSync(path.join(workspace, 'nested/result.txt'), 'utf8'), 'inside');
  console.log('✅ SECURITY OK — generated file paths stay inside their workspace.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
