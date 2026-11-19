export const MP4_FASTSTART_ERRORS = {
  INVALID_CONTAINER:
    "Hubo un error con el video: el archivo seleccionado no es un video MP4 válido. Conviértelo a MP4 e inténtalo de nuevo.",
  TRUNCATED_ATOM:
    "Hubo un error al leer el video: el archivo parece estar incompleto o dañado.",
  OFFSET_OVERFLOW:
    "Hubo un error al preparar el video: no fue posible optimizar este archivo.",
} as const;

export interface Mp4AtomInfo {
  readonly type: string;
  readonly offset: number;
  readonly size: number;
  readonly headerSize: number;
}

export interface Mp4ContainerInspection {
  readonly isValidMp4: boolean;
  readonly alreadyFaststart: boolean;
  readonly isFragmented: boolean;
  readonly needsRelocation: boolean;
  readonly atoms: readonly Mp4AtomInfo[];
  readonly ftypAtom: Mp4AtomInfo | null;
  readonly moovAtom: Mp4AtomInfo | null;
  readonly mdatAtom: Mp4AtomInfo | null;
}

export interface Mp4FaststartRelocationResult {
  readonly blob: Blob;
  readonly relocated: boolean;
  readonly inspection: Mp4ContainerInspection;
}

const CONTAINER_BOX_TYPES = new Set([
  "moov",
  "trak",
  "mdia",
  "minf",
  "stbl",
]);

const UINT32_MAX = 0xffff_ffff;
const MAX_SCANNABLE_MOOV_BYTES = 64 * 1024 * 1024;

function readFourCc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset]!,
    bytes[offset + 1]!,
    bytes[offset + 2]!,
    bytes[offset + 3]!,
  );
}

async function readTopLevelAtoms(blob: Blob): Promise<Mp4AtomInfo[]> {
  const atoms: Mp4AtomInfo[] = [];
  let offset = 0;

  while (offset + 8 <= blob.size) {
    const headerSlice = await blob
      .slice(offset, Math.min(offset + 16, blob.size))
      .arrayBuffer();
    const headerBytes = new Uint8Array(headerSlice);
    if (headerBytes.byteLength < 8) {
      break;
    }

    const view = new DataView(headerBytes.buffer, headerBytes.byteOffset);
    const size32 = view.getUint32(0, false);
    const type = readFourCc(headerBytes, 4);

    let headerSize = 8;
    let size = size32;

    if (size32 === 1) {
      if (headerBytes.byteLength < 16) {
        throw new Error(MP4_FASTSTART_ERRORS.TRUNCATED_ATOM);
      }
      const bigSize = view.getBigUint64(8, false);
      size = Number(bigSize);
      headerSize = 16;
    } else if (size32 === 0) {
      size = blob.size - offset;
    }

    if (!Number.isFinite(size) || size < headerSize || offset + size > blob.size) {
      if (atoms.length === 0) {
        return [];
      }
      throw new Error(MP4_FASTSTART_ERRORS.TRUNCATED_ATOM);
    }

    atoms.push({ type, offset, size, headerSize });
    offset += size;
  }

  return atoms;
}

function moovContainsMvex(moovBytes: Uint8Array): boolean {
  const view = new DataView(
    moovBytes.buffer,
    moovBytes.byteOffset,
    moovBytes.byteLength,
  );
  let cursor = 8;
  if (view.getUint32(0, false) === 1) {
    cursor = 16;
  }

  while (cursor + 8 <= moovBytes.byteLength) {
    const size32 = view.getUint32(cursor, false);
    const type = readFourCc(moovBytes, cursor + 4);
    const size =
      size32 === 1 && cursor + 16 <= moovBytes.byteLength
        ? Number(view.getBigUint64(cursor + 8, false))
        : size32;

    if (!Number.isFinite(size) || size < 8 || cursor + size > moovBytes.byteLength) {
      return false;
    }
    if (type === "mvex") {
      return true;
    }
    cursor += size;
  }

  return false;
}

function patchChunkOffsetsRecursive(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  insertOffset: number,
  oldMoovOffset: number,
  deltaBytes: number,
): void {
  let cursor = start;

  while (cursor + 8 <= end) {
    const size32 = view.getUint32(cursor, false);
    const type = readFourCc(bytes, cursor + 4);

    let headerSize = 8;
    let size = size32;

    if (size32 === 1) {
      if (cursor + 16 > end) {
        return;
      }
      size = Number(view.getBigUint64(cursor + 8, false));
      headerSize = 16;
    } else if (size32 === 0) {
      size = end - cursor;
    }

    if (!Number.isFinite(size) || size < headerSize || cursor + size > end) {
      return;
    }

    const boxEnd = cursor + size;
    const payloadStart = cursor + headerSize;

    if (CONTAINER_BOX_TYPES.has(type)) {
      patchChunkOffsetsRecursive(
        bytes,
        view,
        payloadStart,
        boxEnd,
        insertOffset,
        oldMoovOffset,
        deltaBytes,
      );
    } else if (type === "stco" && payloadStart + 8 <= boxEnd) {
      const entryCount = view.getUint32(payloadStart + 4, false);
      const entriesStart = payloadStart + 8;
      for (let i = 0; i < entryCount; i++) {
        const entryPos = entriesStart + i * 4;
        if (entryPos + 4 > boxEnd) {
          break;
        }
        const origOffset = view.getUint32(entryPos, false);
        if (origOffset >= insertOffset && origOffset < oldMoovOffset) {
          const nextOffset = origOffset + deltaBytes;
          if (nextOffset > UINT32_MAX) {
            throw new Error(MP4_FASTSTART_ERRORS.OFFSET_OVERFLOW);
          }
          view.setUint32(entryPos, nextOffset, false);
        }
      }
    } else if (type === "co64" && payloadStart + 8 <= boxEnd) {
      const entryCount = view.getUint32(payloadStart + 4, false);
      const entriesStart = payloadStart + 8;
      const insertBig = BigInt(insertOffset);
      const oldMoovBig = BigInt(oldMoovOffset);
      const deltaBig = BigInt(deltaBytes);

      for (let i = 0; i < entryCount; i++) {
        const entryPos = entriesStart + i * 8;
        if (entryPos + 8 > boxEnd) {
          break;
        }
        const origOffset = view.getBigUint64(entryPos, false);
        if (origOffset >= insertBig && origOffset < oldMoovBig) {
          view.setBigUint64(entryPos, origOffset + deltaBig, false);
        }
      }
    }

    cursor = boxEnd;
  }
}

export async function inspectMp4Container(
  blob: Blob,
): Promise<Mp4ContainerInspection> {
  if (blob.size < 12) {
    return {
      isValidMp4: false,
      alreadyFaststart: false,
      isFragmented: false,
      needsRelocation: false,
      atoms: [],
      ftypAtom: null,
      moovAtom: null,
      mdatAtom: null,
    };
  }

  const headBytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  if (readFourCc(headBytes, 4) !== "ftyp") {
    return {
      isValidMp4: false,
      alreadyFaststart: false,
      isFragmented: false,
      needsRelocation: false,
      atoms: [],
      ftypAtom: null,
      moovAtom: null,
      mdatAtom: null,
    };
  }

  const atoms = await readTopLevelAtoms(blob);
  const ftypAtom = atoms.find((a) => a.type === "ftyp") ?? null;
  const moovAtom = atoms.find((a) => a.type === "moov") ?? null;
  const mdatAtom = atoms.find((a) => a.type === "mdat") ?? null;

  let isFragmented = atoms.some((a) => a.type === "moof" || a.type === "mvex");
  if (!isFragmented && moovAtom && moovAtom.size <= MAX_SCANNABLE_MOOV_BYTES) {
    const moovBytes = new Uint8Array(
      await blob
        .slice(moovAtom.offset, moovAtom.offset + moovAtom.size)
        .arrayBuffer(),
    );
    if (moovContainsMvex(moovBytes)) {
      isFragmented = true;
    }
  }

  const alreadyFaststart = Boolean(
    moovAtom && mdatAtom && moovAtom.offset < mdatAtom.offset,
  );
  const needsRelocation = Boolean(
    ftypAtom &&
      moovAtom &&
      mdatAtom &&
      !isFragmented &&
      mdatAtom.offset < moovAtom.offset,
  );

  return {
    isValidMp4: Boolean(ftypAtom && moovAtom),
    alreadyFaststart,
    isFragmented,
    needsRelocation,
    atoms,
    ftypAtom,
    moovAtom,
    mdatAtom,
  };
}

export async function relocateMp4MoovToStart(
  blob: Blob,
): Promise<Mp4FaststartRelocationResult> {
  const inspection = await inspectMp4Container(blob);
  if (!inspection.isValidMp4 || !inspection.ftypAtom) {
    throw new Error(MP4_FASTSTART_ERRORS.INVALID_CONTAINER);
  }

  if (
    !inspection.needsRelocation ||
    !inspection.moovAtom ||
    !inspection.mdatAtom
  ) {
    return {
      blob,
      relocated: false,
      inspection,
    };
  }

  const insertOffset =
    inspection.ftypAtom.offset + inspection.ftypAtom.size;
  const moovOffset = inspection.moovAtom.offset;
  const moovSize = inspection.moovAtom.size;
  const moovEnd = moovOffset + moovSize;

  const moovBuffer = await blob.slice(moovOffset, moovEnd).arrayBuffer();
  const moovBytes = new Uint8Array(moovBuffer);
  const moovView = new DataView(moovBuffer);

  patchChunkOffsetsRecursive(
    moovBytes,
    moovView,
    0,
    moovBytes.byteLength,
    insertOffset,
    moovOffset,
    moovSize,
  );

  const parts: BlobPart[] = [
    blob.slice(0, insertOffset),
    moovBytes,
    blob.slice(insertOffset, moovOffset),
  ];
  if (moovEnd < blob.size) {
    parts.push(blob.slice(moovEnd, blob.size));
  }

  const relocatedBlob = new Blob(parts, { type: blob.type || "video/mp4" });
  const postInspection = await inspectMp4Container(relocatedBlob);

  return {
    blob: relocatedBlob,
    relocated: true,
    inspection: postInspection,
  };
}
