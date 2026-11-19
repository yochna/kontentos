import { uploadFileError } from './uploadFile';

export interface PickedUploadFile {
  name: string;
  size: number;
  lastModified?: number;
}

export interface UploadBatchPlan {
  files: PickedUploadFile[];
  /** Human-readable reasons a selected file cannot be uploaded. */
  invalid: string[];
  /** Exact repeats already dropped into this batch or already on the bench. */
  duplicates: number;
  /** Valid files held back because the server allows only three open sessions. */
  deferred: number;
}

const keyOf = (file: PickedUploadFile) => `${file.name}:${file.size}:${file.lastModified ?? 0}`;

/**
 * A multi-file picker is a batch, not a gamble on the first file. Refuse bad files up front, drop
 * exact repeats, and keep the rest in order so a later failure never cancels earlier good takes.
 */
export function planUploadBatch(
  selected: readonly PickedUploadFile[],
  alreadyOnBench: readonly PickedUploadFile[] = [],
  maxFiles = 3
): UploadBatchPlan {
  const seen = new Set(alreadyOnBench.map(keyOf));
  const files: PickedUploadFile[] = [];
  const invalid: string[] = [];
  let duplicates = 0;

  for (const file of selected) {
    const problem = uploadFileError(file);
    if (problem) {
      invalid.push(`${file.name}: ${problem}`);
      continue;
    }
    const key = keyOf(file);
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    files.push(file);
  }

  return {
    files: files.slice(0, maxFiles),
    invalid,
    duplicates,
    deferred: Math.max(0, files.length - maxFiles),
  };
}
