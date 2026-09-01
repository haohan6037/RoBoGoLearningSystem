import type { StudioProjectRecord } from '@/types/assembly';

export type TransportAsset = {
  name?: string;
  type: string;
  dataBase64: string;
  updatedAt?: string;
  camera?: NonNullable<StudioProjectRecord['coverAsset']>['camera'];
};

export type TransportStudioProject = Omit<StudioProjectRecord, 'modelAsset' | 'coverAsset'> & {
  modelAsset?: TransportAsset | null;
  coverAsset?: TransportAsset | null;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const bytes = base64ToBytes(value);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export async function projectToTransport(
  record: StudioProjectRecord,
  includeModelAsset = true,
  includeCoverAsset = true,
): Promise<TransportStudioProject> {
  const { modelAsset, coverAsset, ...project } = record;
  return {
    ...project,
    ...(includeModelAsset ? {
      modelAsset: modelAsset ? {
        name: modelAsset.name,
        type: modelAsset.type,
        dataBase64: bytesToBase64(new Uint8Array(await modelAsset.blob.arrayBuffer())),
      } : null,
    } : {}),
    ...(includeCoverAsset ? {
      coverAsset: coverAsset ? {
        type: coverAsset.type,
        dataBase64: bytesToBase64(new Uint8Array(await coverAsset.blob.arrayBuffer())),
        updatedAt: coverAsset.updatedAt,
        camera: coverAsset.camera,
      } : null,
    } : {}),
  };
}

export function projectFromTransport(record: TransportStudioProject): StudioProjectRecord {
  return {
    ...record,
    modelAsset: record.modelAsset ? {
      name: record.modelAsset.name ?? 'model.glb',
      type: record.modelAsset.type,
      blob: new Blob([base64ToArrayBuffer(record.modelAsset.dataBase64)], { type: record.modelAsset.type }),
    } : null,
    coverAsset: record.coverAsset?.camera ? {
      type: record.coverAsset.type,
      blob: new Blob([base64ToArrayBuffer(record.coverAsset.dataBase64)], { type: record.coverAsset.type }),
      updatedAt: record.coverAsset.updatedAt ?? new Date(0).toISOString(),
      camera: record.coverAsset.camera,
    } : null,
  };
}
