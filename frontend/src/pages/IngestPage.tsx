import { useState, type FormEvent, type ChangeEvent } from 'react';
import { PageLayout, JobStatusIndicator } from '@/components';
import { ingestUrl } from '@/api/client';
import type { IngestMetadata } from '@/types/api';

interface FormData {
  url: string;
  title: string;
  author: string;
  year: string;
  genre: string;
}

interface FormErrors {
  url?: string;
  year?: string;
}

const INITIAL_FORM_DATA: FormData = {
  url: '',
  title: '',
  author: '',
  year: '',
  genre: '',
};

export function IngestPage() {
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{
    type: 'success' | 'error';
    message: string;
    jobId?: string;
  } | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

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

    // URL is required and must be valid
    const urlTrimmed = formData.url.trim();
    if (!urlTrimmed) {
      newErrors.url = 'URL is required';
    } else {
      try {
        const parsed = new URL(urlTrimmed);
        // Only allow http/https protocols for security
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          newErrors.url = 'URL must use http:// or https://';
        }
      } catch {
        newErrors.url = 'Please enter a valid URL';
      }
    }

    // Year must be a valid number if provided
    if (formData.year.trim()) {
      const yearNum = parseInt(formData.year, 10);
      if (isNaN(yearNum)) {
        newErrors.year = 'Year must be a number';
      } else if (yearNum < 1000 || yearNum > new Date().getFullYear() + 10) {
        newErrors.year = `Year must be between 1000 and ${new Date().getFullYear() + 10}`;
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

    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      // Prepare metadata object (only include non-empty fields)
      const metadata: IngestMetadata = {};
      if (formData.title.trim()) metadata.title = formData.title.trim();
      if (formData.author.trim()) metadata.author = formData.author.trim();
      if (formData.year.trim()) metadata.year = parseInt(formData.year, 10);
      if (formData.genre.trim()) metadata.genre = formData.genre.trim();

      const response = await ingestUrl({
        source_url: formData.url.trim(),
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });

      if (response.status === 'success' || response.status === 'queued') {
        setSubmitStatus({
          type: 'success',
          message: response.message || 'Text queued for ingestion successfully!',
          jobId: response.job_id,
        });
        // Start tracking job status
        if (response.job_id) {
          setActiveJobId(response.job_id);
        }
        // Reset form on success
        setFormData(INITIAL_FORM_DATA);
      } else {
        setSubmitStatus({
          type: 'error',
          message: response.message || 'Failed to queue text for ingestion',
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
    <PageLayout currentPath="/ingest">
      <h1>Ingest Text from URL</h1>
      <p>
        Add a text to the corpus by providing a URL (e.g., from Project Gutenberg).
        The system will fetch the content, process it into semantic chunks, and add it
        to the searchable library.
      </p>

      <form onSubmit={handleSubmit} className="ingest-form" noValidate>
        <div className="form-group">
          <label htmlFor="url">
            Source URL <span className="required">*</span>
          </label>
          <input
            id="url"
            name="url"
            type="url"
            value={formData.url}
            onChange={handleChange}
            placeholder="https://www.gutenberg.org/files/12345/12345-0.txt"
            disabled={isSubmitting}
            aria-required="true"
            aria-invalid={!!errors.url}
            aria-describedby={errors.url ? 'url-error' : 'url-help'}
          />
          {errors.url && (
            <p id="url-error" className="form-error" role="alert">
              {errors.url}
            </p>
          )}
          {!errors.url && (
            <p id="url-help" className="form-help">
              Direct link to a plain text file. Project Gutenberg texts work well.
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
            placeholder="e.g., Pride and Prejudice"
            disabled={isSubmitting}
          />
          <p className="form-help">Optional. The title of the work.</p>
        </div>

        <div className="form-group">
          <label htmlFor="author">Author</label>
          <input
            id="author"
            name="author"
            type="text"
            value={formData.author}
            onChange={handleChange}
            placeholder="e.g., Jane Austen"
            disabled={isSubmitting}
          />
          <p className="form-help">Optional. The author's name.</p>
        </div>

        <div className="form-group">
          <label htmlFor="year">Year</label>
          <input
            id="year"
            name="year"
            type="number"
            value={formData.year}
            onChange={handleChange}
            placeholder="e.g., 1813"
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
            placeholder="e.g., novel, essay, poetry"
            disabled={isSubmitting}
          />
          <p className="form-help">Optional. Genre or category.</p>
        </div>

        <div className="form-actions">
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Ingest Text'}
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
