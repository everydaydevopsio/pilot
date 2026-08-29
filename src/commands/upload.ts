import type { Client } from 'chrome-remote-interface';
import type { ElementRefMap } from '../browser/inspect/element-ref.js';
import {
  validateUploadFiles,
  uploadFiles
} from '../browser/interaction/uploads.js';

export interface UploadParams {
  ref: string;
  files: string[];
}

export interface UploadResult {
  ref: string;
  files: string[];
}

export async function executeUpload(
  client: Client,
  refMap: ElementRefMap,
  params: UploadParams
): Promise<UploadResult> {
  if (params.files.length === 0) {
    throw new Error('At least one file is required');
  }

  const backendNodeId = refMap.resolve(params.ref);

  // Validate files before uploading
  validateUploadFiles(params.files);

  // Upload to the file input element
  await uploadFiles(client, backendNodeId, params.files);

  return { ref: params.ref, files: params.files };
}
