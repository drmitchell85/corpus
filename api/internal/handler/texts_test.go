package handler

import (
	"os"
	"path/filepath"
	"testing"

	"corpus/api/internal/config"
)

func TestIsUploadedPDF(t *testing.T) {
	// Set up a temporary uploads directory for testing
	tmpDir := t.TempDir()
	uploadsDir := filepath.Join(tmpDir, "uploads")
	if err := os.MkdirAll(uploadsDir, 0755); err != nil {
		t.Fatalf("failed to create test uploads directory: %v", err)
	}

	// Save original config and restore after test
	originalUploadPath := config.UploadPath
	config.UploadPath = uploadsDir
	t.Cleanup(func() {
		config.UploadPath = originalUploadPath
	})

	tests := []struct {
		name      string
		sourceURL string
		expected  bool
	}{
		{
			name:      "uploaded PDF with absolute path",
			sourceURL: filepath.Join(uploadsDir, "abc123.pdf"),
			expected:  true,
		},
		{
			name:      "HTTP URL",
			sourceURL: "http://www.gutenberg.org/files/1342/1342-0.txt",
			expected:  false,
		},
		{
			name:      "HTTPS URL",
			sourceURL: "https://example.com/document.pdf",
			expected:  false,
		},
		{
			name:      "PDF not in uploads directory",
			sourceURL: filepath.Join(tmpDir, "file.pdf"),
			expected:  false,
		},
		{
			name:      "Non-PDF in uploads directory",
			sourceURL: filepath.Join(uploadsDir, "file.txt"),
			expected:  false,
		},
		{
			name:      "PDF with uppercase extension",
			sourceURL: filepath.Join(uploadsDir, "file.PDF"),
			expected:  true,
		},
		{
			name:      "path traversal attempt - parent directory",
			sourceURL: filepath.Join(uploadsDir, "..", "..", "etc", "passwd.pdf"),
			expected:  false,
		},
		{
			name:      "path traversal attempt - embedded",
			sourceURL: filepath.Join(tmpDir, "foo", "uploads", "..", "..", "etc", "passwd.pdf"),
			expected:  false,
		},
		{
			name:      "path with uploads substring but wrong location",
			sourceURL: filepath.Join(tmpDir, "my-uploads", "file.pdf"),
			expected:  false,
		},
		{
			name:      "empty source URL",
			sourceURL: "",
			expected:  false,
		},
		{
			name:      "whitespace-only source URL",
			sourceURL: "   ",
			expected:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isUploadedPDF(tt.sourceURL)
			if result != tt.expected {
				t.Errorf("isUploadedPDF(%q) = %v, expected %v", tt.sourceURL, result, tt.expected)
			}
		})
	}
}

func TestCleanupPDFFile(t *testing.T) {
	// Create a temporary directory for testing
	tmpDir := t.TempDir()
	uploadsDir := filepath.Join(tmpDir, "uploads")
	if err := os.MkdirAll(uploadsDir, 0755); err != nil {
		t.Fatalf("failed to create test uploads directory: %v", err)
	}

	// Save original config and restore after all tests
	originalUploadPath := config.UploadPath
	config.UploadPath = uploadsDir
	t.Cleanup(func() {
		config.UploadPath = originalUploadPath
	})

	t.Run("deletes existing PDF file", func(t *testing.T) {
		// Create a test PDF file
		testFile := filepath.Join(uploadsDir, "test-delete.pdf")
		if err := os.WriteFile(testFile, []byte("%PDF-test"), 0644); err != nil {
			t.Fatalf("failed to create test PDF: %v", err)
		}

		// Verify file exists
		if _, err := os.Stat(testFile); os.IsNotExist(err) {
			t.Fatal("test PDF should exist before cleanup")
		}

		// Clean up the file
		cleanupPDFFile("test-req-id", testFile)

		// Verify file was deleted
		if _, err := os.Stat(testFile); !os.IsNotExist(err) {
			t.Error("test PDF should be deleted after cleanup")
		}
	})

	t.Run("handles non-existent PDF gracefully", func(t *testing.T) {
		// Try to clean up a file that doesn't exist
		nonExistentFile := filepath.Join(uploadsDir, "non-existent.pdf")

		// This should not panic
		cleanupPDFFile("test-req-id", nonExistentFile)
	})

	t.Run("skips HTTP URLs", func(t *testing.T) {
		// This should not attempt to delete anything
		cleanupPDFFile("test-req-id", "http://example.com/file.pdf")
	})

	t.Run("skips non-PDF files", func(t *testing.T) {
		// Create a non-PDF file in uploads
		testFile := filepath.Join(uploadsDir, "test.txt")
		if err := os.WriteFile(testFile, []byte("test"), 0644); err != nil {
			t.Fatalf("failed to create test file: %v", err)
		}

		// Try to clean up (should skip)
		cleanupPDFFile("test-req-id", testFile)

		// Verify file still exists
		if _, err := os.Stat(testFile); os.IsNotExist(err) {
			t.Error("non-PDF file should not be deleted")
		}
	})

	t.Run("refuses to delete symlink", func(t *testing.T) {
		// Create a target file outside uploads
		targetFile := filepath.Join(tmpDir, "target.txt")
		if err := os.WriteFile(targetFile, []byte("sensitive data"), 0644); err != nil {
			t.Fatalf("failed to create target file: %v", err)
		}

		// Create a symlink in uploads pointing to the target
		symlinkPath := filepath.Join(uploadsDir, "malicious.pdf")
		if err := os.Symlink(targetFile, symlinkPath); err != nil {
			t.Skipf("skipping symlink test: %v", err) // Skip on systems that don't support symlinks
		}

		// Try to clean up the symlink
		cleanupPDFFile("test-req-id", symlinkPath)

		// Verify target file still exists
		if _, err := os.Stat(targetFile); os.IsNotExist(err) {
			t.Error("symlink target should not be deleted")
		}

		// Verify symlink still exists (wasn't deleted)
		if _, err := os.Lstat(symlinkPath); os.IsNotExist(err) {
			t.Error("symlink itself should not be deleted")
		}
	})
}
