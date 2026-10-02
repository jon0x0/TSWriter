/* Local-only TSRT v1 cassette extraction. Also usable from Node for fixture tests. */
(function (scope) {
  'use strict';
  function extractRtf(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length > 64 * 1024 * 1024) throw Error('Choose an export TAP smaller than 64 MiB.');
    let offset = 0;
    const fail = message => { throw Error(message); };
    function block() {
      if (offset + 2 > bytes.length) fail('Incomplete recording: missing block or completion marker.');
      const size = bytes[offset] | bytes[offset + 1] << 8;
      offset += 2;
      if (size < 2 || size > 521 || offset + size > bytes.length) fail('Invalid or truncated export block.');
      const raw = bytes.subarray(offset, offset + size); offset += size;
      if (raw.reduce((a, b) => a ^ b, 0)) fail('Damaged tape block: checksum mismatch.');
      return [raw[0], raw.subarray(1, -1)];
    }
    function equal(a, b) { return a.length === b.length && a.every((v, i) => v === b[i]); }
    const ascii = text => Uint8Array.from(text, c => c.charCodeAt(0));
    let [flag, data] = block();
    if (flag !== 0 || !equal(data, ascii('\x03TSWRITERtf\x10\0\0\0\0\0'))) fail('Choose a tape made with File > Export RTF. Native document saves use the Python converter.');
    [flag, data] = block();
    if (flag !== 255 || !equal(data, ascii('TSRT\x01\0\0\x02' + '\0'.repeat(8)))) fail('Unsupported export format.');
    const chunks = []; let sequence = 0, total = 0, crc = 0xffffffff;
    const uint = (data, at) => new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(at, true);
    while (true) {
      [flag, data] = block();
      if (flag !== 255 || data.length < 5) fail('Invalid export record.');
      if (uint(data, 1) !== sequence) fail('Missing, duplicate or reordered export block.');
      if (data[0] === 2) {
        if (data.length !== 13 || uint(data, 5) !== total || uint(data, 9) !== ((crc ^ 0xffffffff) >>> 0)) fail('Incomplete or damaged export: final checksum mismatch.');
        if (offset !== bytes.length) fail('Extra data after export: use a tape containing one export.');
        if (!sequence) fail('Empty RTF stream.');
        const output = new Uint8Array(total); let at = 0;
        for (const chunk of chunks) { output.set(chunk, at); at += chunk.length; }
        return output;
      }
      if (data[0] !== 1 || data.length < 7) fail('Unknown export record.');
      const size = data[5] | data[6] << 8, chunk = data.subarray(7);
      if (size < 1 || size > 512 || size !== chunk.length) fail('Export chunk length mismatch.');
      if (!sequence && !equal(chunk.subarray(0, 6), ascii('{\\rtf1'))) fail('Export does not contain RTF.');
      for (const byte of chunk) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
      chunks.push(chunk); total += size; sequence++;
    }
  }
  scope.extractTsWriterRtf = extractRtf;
  if (typeof module !== 'undefined') module.exports = extractRtf;
  if (typeof document === 'undefined') return;
  const input = document.getElementById('tape'), status = document.getElementById('status'), download = document.getElementById('download');
  let objectUrl = null, generation = 0;
  input.addEventListener('change', async () => {
    const current = ++generation;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null; download.hidden = true;
    const file = input.files[0]; if (!file) { status.textContent = 'Choose your exported TAP file.'; return; }
    status.textContent = 'Checking cassette blocks…';
    try {
      if (file.size > 64 * 1024 * 1024) throw Error('Choose an export TAP smaller than 64 MiB.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (current !== generation) return;
      const output = extractRtf(bytes);
      objectUrl = URL.createObjectURL(new Blob([output], {type:'application/rtf'}));
      download.href = objectUrl; download.download = file.name.replace(/\.tap$/i, '') + '.rtf'; download.hidden = false;
      status.textContent = `${output.length.toLocaleString()} RTF bytes verified. Ready to open in LibreOffice.`;
    } catch (error) { if (current === generation) status.textContent = error.message; }
  });
})(globalThis);
