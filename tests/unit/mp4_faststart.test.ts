import { describe, expect, it } from "vitest";
import {
  inspectMp4Container,
  relocateMp4MoovToStart,
} from "../../src/admin/mp4-faststart";

function encodeFourCc(type: string): Uint8Array {
  return new Uint8Array([
    type.charCodeAt(0),
    type.charCodeAt(1),
    type.charCodeAt(2),
    type.charCodeAt(3),
  ]);
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function makeBox(type: string, ...childrenOrPayloads: Uint8Array[]): Uint8Array {
  const payload = concatBytes(...childrenOrPayloads);
  const totalSize = 8 + payload.byteLength;
  const buf = new Uint8Array(totalSize);
  const view = new DataView(buf.buffer);
  view.setUint32(0, totalSize, false);
  buf.set(encodeFourCc(type), 4);
  buf.set(payload, 8);
  return buf;
}

function makeStcoBox(offsets: number[]): Uint8Array {
  const payload = new Uint8Array(8 + offsets.length * 4);
  const view = new DataView(payload.buffer);
  view.setUint32(0, 0, false); // version + flags
  view.setUint32(4, offsets.length, false);
  offsets.forEach((val, idx) => {
    view.setUint32(8 + idx * 4, val, false);
  });
  return makeBox("stco", payload);
}

function makeCo64Box(offsets: bigint[]): Uint8Array {
  const payload = new Uint8Array(8 + offsets.length * 8);
  const view = new DataView(payload.buffer);
  view.setUint32(0, 0, false);
  view.setUint32(4, offsets.length, false);
  offsets.forEach((val, idx) => {
    view.setBigUint64(8 + idx * 8, val, false);
  });
  return makeBox("co64", payload);
}

function makeMoovWithChunkTable(chunkTableBox: Uint8Array): Uint8Array {
  return makeBox(
    "moov",
    makeBox(
      "trak",
      makeBox("mdia", makeBox("minf", makeBox("stbl", chunkTableBox))),
    ),
  );
}

async function readStcoOffsetsFromMoov(
  bytes: Uint8Array,
  moovOffset: number,
  moovSize: number,
): Promise<number[]> {
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset + moovOffset,
    moovSize,
  );
  // Find 'stco' signature inside moov buffer
  for (let i = 0; i <= moovSize - 16; i++) {
    if (
      bytes[moovOffset + i + 4] === "s".charCodeAt(0) &&
      bytes[moovOffset + i + 5] === "t".charCodeAt(0) &&
      bytes[moovOffset + i + 6] === "c".charCodeAt(0) &&
      bytes[moovOffset + i + 7] === "o".charCodeAt(0)
    ) {
      const count = view.getUint32(i + 12, false);
      const out: number[] = [];
      for (let c = 0; c < count; c++) {
        out.push(view.getUint32(i + 16 + c * 4, false));
      }
      return out;
    }
  }
  throw new Error("stco not found");
}

async function readCo64OffsetsFromMoov(
  bytes: Uint8Array,
  moovOffset: number,
  moovSize: number,
): Promise<bigint[]> {
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset + moovOffset,
    moovSize,
  );
  for (let i = 0; i <= moovSize - 16; i++) {
    if (
      bytes[moovOffset + i + 4] === "c".charCodeAt(0) &&
      bytes[moovOffset + i + 5] === "o".charCodeAt(0) &&
      bytes[moovOffset + i + 6] === "6".charCodeAt(0) &&
      bytes[moovOffset + i + 7] === "4".charCodeAt(0)
    ) {
      const count = view.getUint32(i + 12, false);
      const out: bigint[] = [];
      for (let c = 0; c < count; c++) {
        out.push(view.getBigUint64(i + 16 + c * 8, false));
      }
      return out;
    }
  }
  throw new Error("co64 not found");
}

describe("MP4 Lossless Faststart Relocation", () => {
  it("relocates trailing moov before mdat and shifts 32-bit stco chunk offsets by +moov.byteLength", async () => {
    const ftyp = makeBox("ftyp", new Uint8Array([0x69, 0x73, 0x6f, 0x6d])); // 12 bytes
    const mdatPayload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const mdat = makeBox("mdat", mdatPayload); // 16 bytes -> starts at 12, ends at 28

    // First sample byte inside mdat is at file offset 12 + 8 = 20, second sample at 24
    const moov = makeMoovWithChunkTable(makeStcoBox([20, 24]));
    const rawBlob = new Blob([concatBytes(ftyp, mdat, moov)], {
      type: "video/mp4",
    });

    const preCheck = await inspectMp4Container(rawBlob);
    expect(preCheck.isValidMp4).toBe(true);
    expect(preCheck.alreadyFaststart).toBe(false);
    expect(preCheck.needsRelocation).toBe(true);

    const result = await relocateMp4MoovToStart(rawBlob);
    expect(result.relocated).toBe(true);
    expect(result.blob.size).toBe(rawBlob.size);

    const postCheck = await inspectMp4Container(result.blob);
    expect(postCheck.alreadyFaststart).toBe(true);
    expect(postCheck.needsRelocation).toBe(false);
    expect(postCheck.atoms.map((a) => a.type)).toEqual(["ftyp", "moov", "mdat"]);

    const outBytes = new Uint8Array(await result.blob.arrayBuffer());
    const shiftedOffsets = await readStcoOffsetsFromMoov(
      outBytes,
      postCheck.moovAtom!.offset,
      postCheck.moovAtom!.size,
    );
    expect(shiftedOffsets).toEqual([
      20 + moov.byteLength,
      24 + moov.byteLength,
    ]);
  });

  it("shifts 64-bit co64 chunk offsets accurately without precision loss", async () => {
    const ftyp = makeBox("ftyp", new Uint8Array([0x6d, 0x70, 0x34, 0x32]));
    const mdat = makeBox("mdat", new Uint8Array(16));
    const moov = makeMoovWithChunkTable(makeCo64Box([24n, 32n]));
    const blob = new Blob([concatBytes(ftyp, mdat, moov)], {
      type: "video/mp4",
    });

    const result = await relocateMp4MoovToStart(blob);
    expect(result.relocated).toBe(true);

    const postCheck = await inspectMp4Container(result.blob);
    const outBytes = new Uint8Array(await result.blob.arrayBuffer());
    const co64Offsets = await readCo64OffsetsFromMoov(
      outBytes,
      postCheck.moovAtom!.offset,
      postCheck.moovAtom!.size,
    );
    expect(co64Offsets).toEqual([
      24n + BigInt(moov.byteLength),
      32n + BigInt(moov.byteLength),
    ]);
  });

  it("preserves already-faststart MP4s untouched and bypasses fragmented MP4 safely", async () => {
    const ftyp = makeBox("ftyp", new Uint8Array([0x69, 0x73, 0x6f, 0x6d]));
    const mdat = makeBox("mdat", new Uint8Array(12));
    const fastMoov = makeMoovWithChunkTable(makeStcoBox([64]));

    const faststartBlob = new Blob([concatBytes(ftyp, fastMoov, mdat)], {
      type: "video/mp4",
    });
    const fastResult = await relocateMp4MoovToStart(faststartBlob);
    expect(fastResult.relocated).toBe(false);
    expect(fastResult.blob).toBe(faststartBlob);
    expect(fastResult.inspection.alreadyFaststart).toBe(true);

    // Fragmented MP4 containing mvex inside moov and moof top-level atom
    const mvexMoov = makeBox("moov", makeBox("mvex", new Uint8Array(8)));
    const moof = makeBox("moof", new Uint8Array(8));
    const fragmentedBlob = new Blob([concatBytes(ftyp, mdat, moof, mvexMoov)], {
      type: "video/mp4",
    });
    const fragmentedResult = await relocateMp4MoovToStart(fragmentedBlob);
    expect(fragmentedResult.relocated).toBe(false);
    expect(fragmentedResult.blob).toBe(fragmentedBlob);
    expect(fragmentedResult.inspection.isFragmented).toBe(true);
  });

  it("rejects non-ftyp disguised containers (such as FLV/MKV) with a plain Spanish diagnostic error", async () => {
    const fakeFlv = new Blob(
      [new Uint8Array([0x46, 0x4c, 0x56, 0x01, 0x05, 0x00, 0x00, 0x00, 0x09])],
      { type: "video/mp4" },
    );

    const inspection = await inspectMp4Container(fakeFlv);
    expect(inspection.isValidMp4).toBe(false);

    await expect(relocateMp4MoovToStart(fakeFlv)).rejects.toThrow(
      /Hubo un error con el video.*no es un video MP4 válido/i,
    );
  });
});
