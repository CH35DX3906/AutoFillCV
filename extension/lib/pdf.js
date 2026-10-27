// Small, offline text extractor for conventional PDF files. No rendering or OCR.
// Supports Flate streams, object streams and embedded ToUnicode CMaps.
const latin = new TextDecoder('latin1');
const bytesToString = bytes => {
  let result = '';
  for (let i = 0; i < bytes.length; i += 32768) result += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return result;
};
const stringToBytes = value => Uint8Array.from(value, c => c.charCodeAt(0) & 255);
async function inflate(bytes) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.length;
      if (size > 24 * 1024 * 1024) throw new Error('PDF 解压后过大，请使用更小的简历文件。');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) {result.set(chunk, offset); offset += chunk.length;}
  return bytesToString(result);
}
function unicode(hex) {
  let result = '';
  for (let i = 0; i + 3 < hex.length; i += 4) result += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  return result;
}
function cmap(text) {
  const map = new Map();
  for (const section of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of section[1].matchAll(/<([\da-f]+)>\s*<([\da-f]+)>/gi)) map.set(pair[1].toUpperCase(), unicode(pair[2]));
  }
  for (const section of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const range of section[1].matchAll(/<([\da-f]+)>\s*<([\da-f]+)>\s*(<([\da-f]+)>|\[([^\]]*)\])/gi)) {
      const start = parseInt(range[1], 16), end = parseInt(range[2], 16);
      if (end - start > 65536) continue;
      const list = range[5] ? [...range[5].matchAll(/<([\da-f]+)>/gi)].map(x => x[1]) : null;
      for (let code = start; code <= end; code++) {
        const target = list ? list[code - start] : (BigInt('0x' + range[4]) + BigInt(code - start)).toString(16).padStart(range[4].length, '0');
        if (target) map.set(code.toString(16).toUpperCase().padStart(range[1].length, '0'), unicode(target));
      }
    }
  }
  return map;
}
function literal(source, start) {
  let text = '', depth = 1, i = start + 1;
  for (; i < source.length && depth; i++) {
    const c = source[i];
    if (c === '\\') {
      const next = source[++i];
      if (/[0-7]/.test(next || '')) {
        let oct = next;
        while (oct.length < 3 && /[0-7]/.test(source[i + 1] || '')) oct += source[++i];
        text += String.fromCharCode(parseInt(oct, 8));
      } else if (next === '\r' || next === '\n') {if (next === '\r' && source[i + 1] === '\n') i++;}
      else text += ({n:'\n', r:'\r', t:'\t', b:'\b', f:'\f'})[next] ?? next ?? '';
    } else if (c === '(') {depth++; text += c;}
    else if (c === ')') {if (--depth) text += c;}
    else text += c;
  }
  return {text, end:i};
}
function decode(raw, map) {
  const hex = [...raw].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase();
  if (hex.startsWith('FEFF')) return unicode(hex.slice(4));
  if (!map?.size) return latin.decode(stringToBytes(raw));
  const lengths = [...new Set([...map.keys()].map(k => k.length))].sort((a,b) => b-a);
  let result = '';
  for (let i = 0; i < hex.length;) {
    const length = lengths.find(n => map.has(hex.slice(i, i + n)));
    if (length) {result += map.get(hex.slice(i, i + length)); i += length;}
    else {result += '�'; i += 2;}
  }
  return result;
}
function contentText(source, fonts) {
  let font = '', inText = false, result = '', pending = [], operands = [];
  for (let i = 0; i < source.length;) {
    if (/\s/.test(source[i])) {i++; continue;}
    if (source[i] === '%') {i = source.indexOf('\n', i); if (i < 0) break; continue;}
    if (source[i] === '(') {const item = literal(source, i); pending.push(item.text); i = item.end; continue;}
    if (source[i] === '<' && source[i+1] !== '<') {
      const end = source.indexOf('>', i); if (end < 0) break;
      let hex = source.slice(i+1,end).replace(/\s/g,''); if (hex.length % 2) hex += '0';
      pending.push(bytesToString(Uint8Array.from(hex.match(/../g) || [], x => parseInt(x,16)))); i = end+1; continue;
    }
    const token = source.slice(i).match(/^\/?[^\s()[\]<>%]+/)?.[0];
    if (!token) {i++; continue;} i += token.length;
    if (token === 'BT') {inText = true; result += '\n';}
    else if (token === 'ET') {inText = false; result += '\n';}
    else if (token === 'Tf') {font = operands.findLast(x => x.startsWith('/'))?.slice(1) || '';}
    else if (inText && ['Tj','TJ',"'",'"'].includes(token)) {
      if (token === "'" || token === '"') result += '\n';
      result += pending.map(raw => decode(raw, fonts[font])).join(''); pending = [];
    } else if (inText && ['Td','TD','Tm','T*'].includes(token)) result += '\n';
    if (/^[A-Za-z*'"]+$/.test(token)) {operands = []; if (!['Tj','TJ'].includes(token)) pending = [];}
    else operands.push(token);
  }
  return result;
}
export async function extractPdf(buffer) {
  if (buffer.byteLength > 12 * 1024 * 1024) throw new Error('请导入 12 MB 以内的 PDF 简历。');
  const source = bytesToString(new Uint8Array(buffer));
  if (!source.slice(0,1024).includes('%PDF-')) throw new Error('文件不是有效的 PDF。');
  if (/\/Encrypt\b/.test(source)) throw new Error('暂不支持加密 PDF，请先导出为无密码的 PDF。');
  const objects = new Map();
  const expression = /(\d+)\s+(\d+)\s+obj\b/g; let match;
  while ((match = expression.exec(source))) {
    const start = expression.lastIndex;
    const streamMatch = /^([\s\S]*?)\bstream\r?\n/.exec(source.slice(start));
    const endObject = source.indexOf('endobj', start);
    if (endObject < 0) break;
    let body = source.slice(start,endObject), stream = '';
    if (streamMatch && start + streamMatch[0].length < endObject) {
      const streamStart = start + streamMatch[0].length;
      const length = /\/Length\s+(\d+)\s*(?!\d)(?!\s+\d+\s+R)/.exec(streamMatch[1]);
      let endStream = length ? streamStart + Number(length[1]) : source.indexOf('endstream', streamStart);
      if (endStream < streamStart) continue;
      body = streamMatch[1];
      if (!/\/Subtype\s*\/Image/.test(body)) {
        const raw = source.slice(streamStart,endStream);
        if (/\/Filter\s*(?:\/FlateDecode|\[\s*\/FlateDecode\s*\])/.test(body)) {
          try {stream = await inflate(stringToBytes(raw));} catch {stream = '';}
        } else if (!/\/Filter\b/.test(body)) stream = raw;
      }
      const closing = source.indexOf('endobj', endStream); if (closing >= 0) expression.lastIndex = closing + 6;
    } else expression.lastIndex = endObject + 6;
    objects.set(match[1], {body,stream});
  }
  for (const obj of [...objects.values()]) {
    if (!/\/Type\s*\/ObjStm\b/.test(obj.body) || !obj.stream) continue;
    const first = Number(obj.body.match(/\/First\s+(\d+)/)?.[1]), count = Number(obj.body.match(/\/N\s+(\d+)/)?.[1]);
    const entries = obj.stream.slice(0,first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < Math.min(count, entries.length/2); i++) objects.set(String(entries[i*2]), {body:obj.stream.slice(first + entries[i*2+1], i+1<count ? first+entries[(i+1)*2+1] : undefined), stream:''});
  }
  const maps = new Map();
  for (const [id,obj] of objects) {
    const ref = obj.body.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
    if (ref) maps.set(id,cmap(objects.get(ref[1])?.stream || ''));
  }
  function fontsFor(body) {
    const fonts = {};
    for (const ref of body.matchAll(/\/([^\s/<>\[\]()]+)\s+(\d+)\s+\d+\s+R/g)) if (maps.has(ref[2])) fonts[ref[1]] = maps.get(ref[2]);
    return fonts;
  }
  const pages = [...objects.values()].filter(obj => /\/Type\s*\/Page\b/.test(obj.body));
  const result = [];
  for (const page of pages) {
    let resources = page.body, parent = page.body, seen = new Set();
    // Resource dictionaries may be inherited from the Pages tree.
    for (let depth = 0; depth < 20; depth++) {
      const resourceRef = parent.match(/\/Resources\s+(\d+)\s+\d+\s+R/);
      if (resourceRef) resources += '\n' + (objects.get(resourceRef[1])?.body || '');
      if (/\/Resources\b/.test(parent)) break;
      const id = parent.match(/\/Parent\s+(\d+)\s+\d+\s+R/)?.[1];
      if (!id || seen.has(id)) break; seen.add(id); parent = objects.get(id)?.body || ''; resources += '\n'+parent;
    }
    const fontRef = resources.match(/\/Font\s+(\d+)\s+\d+\s+R/);
    if (fontRef) resources += '\n' + (objects.get(fontRef[1])?.body || '');
    const fonts = fontsFor(resources);
    const contents = page.body.match(/\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/)?.[1] || '';
    for (const ref of contents.matchAll(/(\d+)\s+\d+\s+R/g)) result.push(contentText(objects.get(ref[1])?.stream || '',fonts));
  }
  const text = result.join('\n').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/\n[ \t]*\n+/g,'\n').trim();
  if (text.replace(/\s/g,'').length < 10) throw new Error('未提取到足够文字：可能是扫描件、图片型 PDF 或暂不支持的编码。第一版尚未内置 OCR，请改用文字型 PDF，或粘贴简历文字。');
  if ((text.match(/�/g)?.length || 0) > text.length * .15) throw new Error('PDF 的字体编码暂不支持，请使用“复制文字导入”，或从原文档重新导出 PDF。');
  return text;
}
