import { useState, useRef, type FormEvent, type ChangeEvent } from 'react';
import { PageLayout, JobStatusIndicator } from '@/components';
import { uploadPdf } from '@/api/client';

interface FormData {
  file: File | null;
  title: string;
  author: string;
  year: string;
  genre: string;
}

interface FormErrors {
  file?: string;
  year?: string;
}

const MIN_YEAR = 1000;
const MAX_YEAR = 2100;

const INITIAL_FORM_DATA: FormData = {
  file: null,
  title: '',
  author: '',
  year: '',
  genre: '',
};

export function UploadPage() {
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{
    type: 'success' | 'error';
    message: string;
    jobId?: string;
    filename?: string;
  } | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setFormData((prev) => ({ ...prev, file }));
    // Clear file error when user selects a file
    if (errors.file) {
      setErrors((prev) => ({ ...prev, file: undefined }));
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error for this field when user starts typing
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // File is required
    if (!formData.file) {
      newErrors.file = 'Please select a PDF file';
    } else {
      // Validate MIME type (not just file extension)
      // Some browsers may not set MIME type, so we accept empty type if extension is .pdf
      const hasPdfMime = formData.file.type === 'application/pdf';
      const hasPdfExtension = formData.file.name.toLowerCase().endsWith('.pdf');
      const hasEmptyMime = formData.file.type === '';

      if (!hasPdfMime && !hasEmptyMime) {
        newErrors.file = 'Only PDF files are accepted (invalid file type)';
      } else if (!hasPdfExtension) {
        newErrors.file = 'Only PDF files are accepted';
      } else {
        // Validate file size (50MB max)
        const maxSize = 50 * 1024 * 1024; // 50MB in bytes
        if (formData.file.size > maxSize) {
          newErrors.file = 'File size must not exceed 50MB';
        }
      }
    }

    // Year must be a valid integer if provided
    if (formData.year.trim()) {
      const yearNum = Number(formData.year);
      if (!Number.isInteger(yearNum)) {
        newErrors.year = 'Year must be a valid integer';
      } else if (yearNum < MIN_YEAR || yearNum > MAX_YEAR) {
        newErrors.year = `Year must be between ${MIN_YEAR} and ${MAX_YEAR}`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    // TypeScript knows file is not null here because validateForm ensures it
    const file = formData.file!;

    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      // Prepare metadata object (only include non-empty fields)
      const metadata: { author?: string; title?: string; year?: number; genre?: string } = {};
      if (formData.title.trim()) metadata.title = formData.title.trim();
      if (formData.author.trim()) metadata.author = formData.author.trim();
      if (formData.year.trim()) metadata.year = parseInt(formData.year, 10);
      if (formData.genre.trim()) metadata.genre = formData.genre.trim();

      const response = await uploadPdf(
        file,
        Object.keys(metadata).length > 0 ? metadata : undefined
      );

      if (response.status === 'queued') {
        setSubmitStatus({
          type: 'success',
          message: response.message || 'PDF queued for processing successfully!',
          jobId: response.job_id,
          filename: response.filename,
        });
        // Start tracking job status
        if (response.job_id) {
          setActiveJobId(response.job_id);
        }
        // Reset form on success
        setFormData(INITIAL_FORM_DATA);
        // Clear file input visual selection
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        setSubmitStatus({
          type: 'error',
          message: response.message || 'Failed to queue PDF for processing',
        });
      }
    } catch (error) {
      setSubmitStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageLayout currentPath="/upload">
      <h1>Upload PDF</h1>
      <p>
        Upload a PDF document to add it to the corpus. The system will extract the text,
        process it into semantic chunks, and add it to the searchable library.
      </p>

      <form onSubmit={handleSubmit} className="ingest-form" noValidate>
        <div className="form-group">
          <label htmlFor="file">
            PDF File <span className="required">*</span>
          </label>
          <input
            ref={fileInputRef}
            id="file"
            name="file"
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFileChange}
            disabled={isSubmitting}
            aria-required="true"
            aria-invalid={!!errors.file}
            aria-describedby={errors.file ? 'file-error' : 'file-help'}
          />
          {formData.file && !errors.file && (
            <p className="form-help">
              Selected: <strong>{formData.file.name}</strong> (
              {(formData.file.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          )}
          {errors.file && (
            <p id="file-error" className="form-error" role="alert">
              {errors.file}
            </p>
          )}
          {!errors.file && !formData.file && (
            <p id="file-help" className="form-help">
              Select a PDF file (max 50MB). Academic papers, books, or documents work well.
            </p>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            name="title"
            type="text"
            value={formData.title}
            onChange={handleChange}
            placeholder="e.g., The Pragmatic Programmer"
            disabled={isSubmitting}
          />
          <p className="form-help">Optional. The title of the document.</p>
        </div>

        <div className="form-group">
          <label htmlFor="author">Author</label>
          <input
            id="author"
            name="author"
            type="text"
            value={formData.author}
            onChange={handleChange}
            placeholder="e.g., Andrew Hunt, David Thomas"
            disabled={isSubmitting}
          />
          <p className="form-help">Optional. The author(s) of the document.</p>
        </div>

        <div className="form-group">
          <label htmlFor="year">Year</label>
          <input
            id="year"
            name="year"
            type="number"
            value={formData.year}
            onChange={handleChange}
            placeholder="e.g., 1999"
            disabled={isSubmitting}
            aria-invalid={!!errors.year}
            aria-describedby={errors.year ? 'year-error' : 'year-help'}
          />
          {errors.year && (
            <p id="year-error" className="form-error" role="alert">
              {errors.year}
            </p>
          )}
          {!errors.year && (
            <p id="year-help" className="form-help">
              Optional. Publication year.
            </p>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="genre">Genre</label>
          <input
            id="genre"
            name="genre"
            type="text"
            value={formData.genre}
            onChange={handleChange}
            placeholder="e.g., technical, reference, essay"
            disabled={isSubmitting}
          />
          <p className="form-help">Optional. Genre or category.</p>
        </div>

        <div className="form-actions">
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Uploading...' : 'Upload PDF'}
          </button>
        </div>
      </form>

      {submitStatus && submitStatus.type === 'error' && (
        <div
          className="status status--error"
          role="alert"
          aria-live="polite"
        >
          <p>{submitStatus.message}</p>
        </div>
      )}

      {activeJobId && (
        <JobStatusIndicator
          jobId={activeJobId}
          onComplete={() => {
            // Clear active job when complete
            setActiveJobId(null);
          }}
          onError={() => {
            // Clear active job on error (error is displayed by indicator)
            setActiveJobId(null);
          }}
        />
      )}
    </PageLayout>
  );
}
