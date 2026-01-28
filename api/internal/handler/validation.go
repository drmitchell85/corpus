package handler

import (
	"fmt"
	"net"
	"net/url"

	"corpus/api/internal/models"
)

// Metadata field length limits (applied to all ingestion endpoints).
const (
	maxTitleLength  = 500
	maxAuthorLength = 200
	maxGenreLength  = 100
)

// validateSourceURL validates that a URL is safe for ingestion.
// Checks scheme, host, and blocks internal/private network addresses (SSRF protection).
func validateSourceURL(sourceURL string) error {
	if sourceURL == "" {
		return &validationError{"source_url is required"}
	}

	// Validate URL format
	parsedURL, err := url.Parse(sourceURL)
	if err != nil {
		return &validationError{"source_url is not a valid URL"}
	}

	// Ensure URL has http or https scheme
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return &validationError{"source_url must use http or https scheme"}
	}

	// Ensure URL has a host
	if parsedURL.Host == "" {
		return &validationError{"source_url must have a valid host"}
	}

	// Block internal/private network addresses (SSRF protection)
	if isInternalHost(parsedURL.Host) {
		return &validationError{"source_url must not reference internal or private network addresses"}
	}

	return nil
}

// validateMetadata validates metadata field lengths.
// Returns error if any field exceeds maximum length.
func validateMetadata(metadata *models.TaskMetadata) error {
	if metadata == nil {
		return nil
	}

	if len(metadata.Title) > maxTitleLength {
		return &validationError{fmt.Sprintf("title too long (max %d characters)", maxTitleLength)}
	}

	if len(metadata.Author) > maxAuthorLength {
		return &validationError{fmt.Sprintf("author too long (max %d characters)", maxAuthorLength)}
	}

	if len(metadata.Genre) > maxGenreLength {
		return &validationError{fmt.Sprintf("genre too long (max %d characters)", maxGenreLength)}
	}

	return nil
}

// isInternalHost checks if a host is internal/private (SSRF protection).
func isInternalHost(host string) bool {
	// Strip port if present
	hostname := host
	if h, _, err := net.SplitHostPort(host); err == nil {
		hostname = h
	}

	// Check for localhost variants
	if hostname == "localhost" || hostname == "" {
		return true
	}

	// Parse IP and check private ranges
	ip := net.ParseIP(hostname)
	if ip == nil {
		// Not an IP address - could be a hostname that resolves to internal IP
		// For now, allow hostnames (DNS resolution happens at request time)
		// A more strict approach would resolve DNS here, but that's blocking
		return false
	}

	// Block loopback (127.0.0.0/8), private (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16),
	// and link-local (169.254.0.0/16) addresses
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast()
}
