const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const PASS = '\x1b[32m✅\x1b[0m', FAIL = '\x1b[31m❌\x1b[0m';
let passed = 0, failed = 0;
const errors = [];

const assert = (cond, msg) => {
  if (cond) { console.log('  ' + PASS + ' ' + msg); passed++; }
  else { console.log('  ' + FAIL + ' ' + msg); failed++; errors.push(msg); }
};

const loadHtml = name => {
  const html = fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8');
  return new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost' });
};

console.log('\n🧪 ETH E2E — 4-file build\n');

console.log('📋 Step 1: Load all 4 HTML files');
const yolo = loadHtml('yolo.html');
const yoloTest = loadHtml('yolo_test.html');
const hodl = loadHtml('hodl.html');
const hodlTest = loadHtml('hodl_test.html');
assert(typeof yolo.window.nugap !== 'undefined', 'yolo.html: nugap exists');
assert(typeof yoloTest.window.nugap !== 'undefined', 'yolo_test.html: nugap exists');
assert(typeof hodl.window.nugap !== 'undefined', 'hodl.html: nugap exists');
assert(typeof hodlTest.window.nugap !== 'undefined', 'hodl_test.html: nugap exists');

console.log('\n📋 Step 2: hodl_test — derive wallet from mnemonic');
const wallet = hodlTest.window.eval("(function() {\
  try {\
    var e = nugap.ethers;\
    var mn = e.Mnemonic.fromPhrase('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');\
    var w = e.HDNodeWallet.fromMnemonic(mn, \"m/44'/60'/0'/0/0\");\
    return { ok: true, addr: w.address, privKey: w.privateKey };\
  } catch(err) { return { ok: false, error: err.message }; }\
})()");
if (wallet.ok) {
  assert(wallet.addr === '0x9858EfFD232B4033E47d90003D41EC34EcaEda94', 'hodl_test: address matches reference');
} else assert(false, 'hodl_test: wallet derivation failed: ' + wallet.error);

console.log('\n📋 Step 3: yolo_test — create unsigned TX');
const unsignedB64 = yoloTest.window.eval("(function() {\
  try {\
    var e = nugap.ethers;\
    var tx = new e.Transaction();\
    tx.type = 2; tx.chainId = 11155111; tx.nonce = 0;\
    tx.to = '0x1234567890abcdef1234567890abcdef12345678';\
    tx.value = e.parseEther('0.01');\
    tx.gasLimit = 21000;\
    tx.maxPriorityFeePerGas = e.parseUnits('1', 'gwei');\
    tx.maxFeePerGas = e.parseUnits('20', 'gwei');\
    var raw = tx.unsignedSerialized;\
    var h = raw.startsWith('0x') ? raw.slice(2) : raw;\
    var bytes = new Uint8Array(h.length / 2);\
    for (var i = 0; i < h.length; i += 2) bytes[i / 2] = parseInt(h.substr(i, 2), 16);\
    var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);\
    return { ok: true, b64: btoa(s), rawLen: bytes.length };\
  } catch(err) { return { ok: false, error: err.message }; }\
})()");
if (unsignedB64.ok) {
  assert(unsignedB64.b64.length > 10, 'yolo_test: unsigned TX created (base64, ' + unsignedB64.rawLen + 'B)');
} else assert(false, 'yolo_test: TX creation failed: ' + unsignedB64.error);

console.log('\n📋 Step 4: hodl_test — sign unsigned TX');
const signResult = hodlTest.window.eval("(function() {\
  try {\
    var e = nugap.ethers;\
    var mn = e.Mnemonic.fromPhrase('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');\
    var w = e.HDNodeWallet.fromMnemonic(mn, \"m/44'/60'/0'/0/0\");\
    var b64 = '" + unsignedB64.b64 + "';\
    var bin = atob(b64);\
    var hex = '0x'; for (var i = 0; i < bin.length; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, '0');\
    var tx = e.Transaction.from(hex);\
    return { ok: true, to: tx.to, value: tx.value.toString(), chainId: tx.chainId.toString(), nonce: tx.nonce };\
  } catch(err) { return { ok: false, error: err.message }; }\
})()");
if (signResult.ok) {
  assert(signResult.to.toLowerCase() === '0x1234567890abcdef1234567890abcdef12345678', 'hodl_test: TX parsed correctly');
  assert(signResult.chainId === '11155111', 'hodl_test: chain ID correct (sepolia)');
} else assert(false, 'hodl_test: TX parse failed: ' + signResult.error);

console.log('\n📋 Step 5: Full air-gap flow (yolo_test → hodl_test → yolo_test)');
const fullFlow = hodlTest.window.eval("(function() {\
  try {\
    var e = nugap.ethers;\
    var mn = e.Mnemonic.fromPhrase('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');\
    var wallet = e.HDNodeWallet.fromMnemonic(mn, \"m/44'/60'/0'/0/0\");\
    var b64 = '" + unsignedB64.b64 + "';\
    var bin = atob(b64);\
    var hex = '0x'; for (var i = 0; i < bin.length; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, '0');\
    var tx = e.Transaction.from(hex);\
    var signed = wallet.signingKey.sign(tx.unsignedHash);\
    tx.signature = signed;\
    var signedRaw = tx.serialized;\
    var parsed = e.Transaction.from(signedRaw);\
    return { ok: true, from: parsed.from, signedLen: signedRaw.length };\
  } catch(err) { return { ok: false, error: err.message }; }\
})()");
if (fullFlow.ok) {
  assert(fullFlow.from === '0x9858EfFD232B4033E47d90003D41EC34EcaEda94', 'Full flow: signed TX from correct address');
  assert(fullFlow.signedLen > 100, 'Full flow: signed TX valid (' + fullFlow.signedLen + ' chars)');
} else assert(false, 'Full flow failed: ' + fullFlow.error);

console.log('\n' + '='.repeat(50));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  console.log('\x1b[31m\n⚠️  SOME TESTS FAILED\x1b[0m');
  errors.forEach(e => console.log('  - ' + e));
  process.exit(1);
} else console.log('\x1b[32m\n🎉 ALL TESTS PASSED!\x1b[0m');
