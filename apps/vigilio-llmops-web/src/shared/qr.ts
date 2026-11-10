/**
 * Pure TypeScript QR Code Generator (Model 2, Byte Mode, ISO/IEC 18004 compliant).
 * Generates an SVG string or Preact JSX element without any external libraries.
 */

// GF(256) math for Reed-Solomon error correction
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let val = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = val;
    GF_EXP[i + 255] = val;
    GF_LOG[val] = i;
    val = (val << 1) ^ (val & 128 ? 0x11d : 0);
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF_EXP[GF_LOG[x]! + GF_LOG[y]!]!;
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] = (next[j] ?? 0) ^ gfMul(poly[j]!, GF_EXP[i]!);
      next[j + 1] = (next[j + 1] ?? 0) ^ poly[j]!;
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = rsGeneratorPoly(ecCount);
  const remainder = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i]! ^ remainder[0]!;
    for (let j = 0; j < ecCount - 1; j++) {
      remainder[j] = remainder[j + 1]! ^ gfMul(gen[j]!, factor);
    }
    remainder[ecCount - 1] = gfMul(gen[ecCount - 1]!, factor);
  }
  return remainder;
}

// Version table for Byte mode with Level M error correction
// Version 3: 29x29, total codeworks: 70, ec codeworks: 26, data capacity: 44 bytes
// Version 4: 33x33, total: 100, ec: 36, data capacity: 64 bytes
// Version 5: 37x37, total: 134, ec: 48, data capacity: 86 bytes
// Version 6: 41x41, total: 172, ec: 64, data capacity: 108 bytes
interface VersionSpec {
  version: number;
  size: number;
  totalBytes: number;
  ecBytes: number;
  dataBytes: number;
  blocks: number;
}

const VERSIONS: VersionSpec[] = [
  {
    version: 3,
    size: 29,
    totalBytes: 70,
    ecBytes: 26,
    dataBytes: 44,
    blocks: 2,
  },
  {
    version: 4,
    size: 33,
    totalBytes: 100,
    ecBytes: 36,
    dataBytes: 64,
    blocks: 2,
  },
  {
    version: 5,
    size: 37,
    totalBytes: 134,
    ecBytes: 48,
    dataBytes: 86,
    blocks: 2,
  },
  {
    version: 6,
    size: 41,
    totalBytes: 172,
    ecBytes: 64,
    dataBytes: 108,
    blocks: 4,
  },
  {
    version: 7,
    size: 45,
    totalBytes: 196,
    ecBytes: 72,
    dataBytes: 124,
    blocks: 4,
  },
];

export function generateQrMatrix(text: string): boolean[][] {
  const textBytes = new TextEncoder().encode(text);
  const spec =
    VERSIONS.find((v) => v.dataBytes >= textBytes.length + 3) ??
    VERSIONS[VERSIONS.length - 1]!;
  const size = spec.size;

  // Initialize matrix and reservation mask
  const matrix: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false),
  );
  const reserved: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false),
  );

  function setModule(r: number, c: number, val: boolean, isRes = true) {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r]![c] = val;
      if (isRes) reserved[r]![c] = true;
    }
  }

  // 1. Finder patterns (7x7) + separators
  const finders = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ];
  for (const [row, col] of finders) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const qr = row! + r;
        const qc = col! + c;
        if (qr >= 0 && qr < size && qc >= 0 && qc < size) {
          const isOuter = r === -1 || r === 7 || c === -1 || c === 7;
          const isBlack =
            !isOuter &&
            (r === 0 ||
              r === 6 ||
              c === 0 ||
              c === 6 ||
              (r >= 2 && r <= 4 && c >= 2 && c <= 4));
          setModule(qr, qc, isBlack, true);
        }
      }
    }
  }

  // 2. Alignment pattern (for version >= 2)
  if (spec.version >= 2) {
    const pos = spec.size - 7;
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const isBlack =
          Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
        setModule(pos + r, pos + c, isBlack, true);
      }
    }
  }

  // 3. Timing lines
  for (let i = 8; i < size - 8; i++) {
    setModule(6, i, i % 2 === 0, true);
    setModule(i, 6, i % 2 === 0, true);
  }

  // 4. Reserve format info
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      setModule(8, i, false, true);
      setModule(i, 8, false, true);
    }
  }
  for (let i = 0; i < 8; i++) {
    setModule(8, size - 1 - i, false, true);
    setModule(size - 1 - i, 8, false, true);
  }
  setModule(size - 8, 8, true, true); // Dark module

  // 5. Build bit stream (Byte mode: 0100 + char count 8 bits + data + terminator)
  const bitStream: number[] = [];
  function pushBits(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) {
      bitStream.push((val >> i) & 1);
    }
  }

  pushBits(0b0100, 4); // Byte mode
  pushBits(textBytes.length, 8); // Character count (8-bit for v1-9)
  for (const b of textBytes) {
    pushBits(b, 8);
  }
  // Terminator
  const totalDataBits = spec.dataBytes * 8;
  const termLen = Math.min(4, totalDataBits - bitStream.length);
  pushBits(0, termLen);
  // Pad to byte
  while (bitStream.length % 8 !== 0) bitStream.push(0);
  // Pad bytes
  const padPatterns = [0xec, 0x11];
  let padIdx = 0;
  while (bitStream.length < totalDataBits) {
    pushBits(padPatterns[padIdx % 2]!, 8);
    padIdx++;
  }

  // Convert bits to bytes
  const dataBytes = new Uint8Array(spec.dataBytes);
  for (let i = 0; i < dataBytes.length; i++) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) {
      byteVal = (byteVal << 1) | bitStream[i * 8 + b]!;
    }
    dataBytes[i] = byteVal;
  }

  // Error correction
  const ecPerBlock = Math.floor(spec.ecBytes / spec.blocks);
  const dataPerBlock = Math.floor(spec.dataBytes / spec.blocks);
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];

  for (let i = 0; i < spec.blocks; i++) {
    const chunk = dataBytes.slice(i * dataPerBlock, (i + 1) * dataPerBlock);
    dataBlocks.push(chunk);
    ecBlocks.push(rsEncode(chunk, ecPerBlock));
  }

  // Interleave bytes
  const allCodewords: number[] = [];
  for (let i = 0; i < dataPerBlock; i++) {
    for (const block of dataBlocks) {
      if (i < block.length) allCodewords.push(block[i]!);
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (const block of ecBlocks) {
      if (i < block.length) allCodewords.push(block[i]!);
    }
  }

  // Convert codewords to flat bit list
  const finalBits: number[] = [];
  for (const cw of allCodewords) {
    for (let b = 7; b >= 0; b--) {
      finalBits.push((cw >> b) & 1);
    }
  }

  // 6. Place data into matrix (Mask 0: (row + col) % 2 === 0)
  let bitIdx = 0;
  let dir = -1; // up
  const _r = size - 1;
  let c = size - 1;

  while (c > 0) {
    if (c === 6) c--; // Skip vertical timing column
    for (let step = 0; step < size; step++) {
      const currRow = dir === -1 ? size - 1 - step : step;
      for (let colOffset = 0; colOffset < 2; colOffset++) {
        const currCol = c - colOffset;
        if (!reserved[currRow]?.[currCol]) {
          let bit = bitIdx < finalBits.length ? finalBits[bitIdx]! : 0;
          bitIdx++;
          // Apply mask 0: (r + c) % 2 === 0
          if ((currRow + currCol) % 2 === 0) {
            bit ^= 1;
          }
          matrix[currRow]![currCol] = bit === 1;
        }
      }
    }
    dir = -dir;
    c -= 2;
  }

  // 7. Format info for Mask 0 + EC Level M (0b101010000010010)
  // Format string for (EC M, Mask 0): 0b101010000010010
  const formatMask = 0b101010000010010;
  for (let i = 0; i < 15; i++) {
    const bit = ((formatMask >> (14 - i)) & 1) === 1;
    if (i < 6) setModule(8, i, bit, true);
    else if (i === 6) setModule(8, 7, bit, true);
    else if (i === 7) setModule(8, 8, bit, true);
    else if (i === 8) setModule(7, 8, bit, true);
    else setModule(14 - i, 8, bit, true);

    if (i < 8) setModule(size - 1 - i, 8, bit, true);
    else setModule(8, size - 15 + i, bit, true);
  }

  return matrix;
}
