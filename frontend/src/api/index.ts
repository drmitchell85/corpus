export {
  ApiError,
  NetworkError,
  checkHealth,
  ingestUrl,
  uploadPdf,
  getJobStatus,
  listTexts,
  searchTexts,
  deleteText,
  getChunkContext,
  getChunksBefore,
  getChunksAfter,
} from './client.ts';

export type * from '@/types/api.ts';
