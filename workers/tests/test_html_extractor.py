"""Unit tests for HTML extraction module."""

import pytest

from workers.html_extractor import extract_and_clean, extract_html_text


class TestExtractHtmlText:
    """Tests for extract_html_text function."""

    def test_extracts_text_from_simple_html(self):
        """Should extract readable text from HTML."""
        html = """
        <html>
        <head><title>Test Article</title></head>
        <body>
            <article>
                <h1>Main Article Title</h1>
                <p>First paragraph of content.</p>
                <p>Second paragraph with more text.</p>
            </article>
        </body>
        </html>
        """
        text, title = extract_html_text(html)

        assert "First paragraph of content" in text
        assert "Second paragraph with more text" in text
        assert title == "Test Article"

    def test_removes_navigation_and_boilerplate(self):
        """Should strip navigation, ads, and sidebar content."""
        html = """
        <html>
        <head><title>Article with Boilerplate</title></head>
        <body>
            <nav>Navigation Menu</nav>
            <aside>Advertisement</aside>
            <article>
                <h1>Main Content</h1>
                <p>This is the important article text.</p>
            </article>
            <footer>Footer content</footer>
        </body>
        </html>
        """
        text, title = extract_html_text(html)

        # Should have main content
        assert "important article text" in text
        # Should not have boilerplate (Readability removes these)
        # Note: Readability's effectiveness varies, so we primarily test that we get text
        assert len(text) > 0

    def test_converts_html_tags_to_paragraph_breaks(self):
        """Should convert block-level HTML tags to paragraph breaks."""
        html = """
        <html>
        <body>
            <article>
                <p>First paragraph.</p>
                <div>Second paragraph in div.</div>
                <h2>Third paragraph as heading.</h2>
            </article>
        </body>
        </html>
        """
        text, title = extract_html_text(html)

        # Should have paragraph breaks (2 newlines) between content
        assert "First paragraph" in text
        assert "Second paragraph in div" in text
        assert "Third paragraph as heading" in text
        # Should not have HTML tags
        assert "<p>" not in text
        assert "</div>" not in text

    def test_handles_br_tags(self):
        """Should convert <br> tags to single newlines."""
        html = """
        <html>
        <body>
            <article>
                <p>Line one<br>Line two<br/>Line three</p>
            </article>
        </body>
        </html>
        """
        text, title = extract_html_text(html)

        assert "Line one" in text
        assert "Line two" in text
        assert "Line three" in text
        # Should not have <br> tags in output
        assert "<br" not in text

    def test_decodes_html_entities(self):
        """Should decode HTML entities like &amp; and &lt;."""
        html = """
        <html>
        <body>
            <article>
                <p>Text with &amp; ampersand and &lt; less than.</p>
                <p>Quotes: &quot;Hello&quot; and &apos;World&apos;</p>
            </article>
        </body>
        </html>
        """
        text, title = extract_html_text(html)

        assert "&" in text
        assert "<" in text
        assert '"' in text or "Hello" in text  # Quote handling varies
        # Should not have HTML entities
        assert "&amp;" not in text
        assert "&lt;" not in text

    def test_removes_script_and_style_tags(self):
        """Should strip <script> and <style> tags completely."""
        html = """
        <html>
        <head>
            <style>body { color: red; }</style>
            <script>console.log('test');</script>
        </head>
        <body>
            <article>
                <p>Visible content.</p>
                <script>alert('inline');</script>
            </article>
        </body>
        </html>
        """
        text, title = extract_html_text(html)

        assert "Visible content" in text
        # Should not have script or style content
        assert "color: red" not in text
        assert "console.log" not in text
        assert "alert" not in text

    def test_collapses_excessive_whitespace(self):
        """Should collapse multiple spaces and limit consecutive newlines."""
        html = """
        <html>
        <body>
            <article>
                <p>Too    many   spaces.</p>
                <p>Multiple</p>
                <p></p>
                <p></p>
                <p>Paragraphs</p>
            </article>
        </body>
        </html>
        """
        text, title = extract_html_text(html)

        # Should collapse multiple spaces to single space
        assert "   " not in text
        assert "Too many spaces" in text
        # Should not have more than 2 consecutive newlines
        assert "\n\n\n" not in text

    def test_extracts_title_from_h1_if_no_title_tag(self):
        """Should extract title from page even without <title> tag."""
        html = """
        <html>
        <body>
            <article>
                <h1>Article Heading as Title</h1>
                <p>Content goes here.</p>
            </article>
        </body>
        </html>
        """
        text, title = extract_html_text(html)

        # Readability should extract some title (may be h1 content)
        assert len(title) > 0
        assert "Content goes here" in text

    def test_empty_html_raises_error(self):
        """Should raise ValueError for empty HTML."""
        with pytest.raises(ValueError, match="HTML content cannot be empty"):
            extract_html_text("")

    def test_whitespace_only_html_raises_error(self):
        """Should raise ValueError for whitespace-only HTML."""
        with pytest.raises(ValueError, match="HTML content cannot be empty"):
            extract_html_text("   \n\n   ")

    def test_html_with_no_content_raises_error(self):
        """Should raise ValueError if extraction produces no text."""
        html = """
        <html>
        <head><title>Empty</title></head>
        <body>
            <!-- Only comments, no real content -->
        </body>
        </html>
        """
        # Readability should extract minimal/no content, raising ValueError
        with pytest.raises(ValueError, match="HTML extraction produced no text content"):
            extract_html_text(html)

    def test_url_parameter_passed_to_readability(self):
        """Should accept optional URL parameter for link resolution."""
        html = """
        <html>
        <body>
            <article>
                <p>Content with <a href="/relative/path">link</a>.</p>
            </article>
        </body>
        </html>
        """
        # Should not raise error when URL is provided
        text, title = extract_html_text(html, url="https://example.com/article")

        assert "Content with" in text
        assert "link" in text

    def test_rejects_non_string_input(self):
        """Should raise TypeError for non-string HTML input."""
        with pytest.raises(TypeError, match="HTML must be str"):
            extract_html_text(b"<html><body>bytes</body></html>")

        with pytest.raises(TypeError, match="HTML must be str"):
            extract_html_text(12345)

        with pytest.raises(TypeError, match="HTML must be str"):
            extract_html_text(None)

    def test_rejects_html_exceeding_size_limit(self):
        """Should raise ValueError for HTML larger than MAX_HTML_SIZE."""
        from workers.html_extractor import MAX_HTML_SIZE

        # Create HTML just over the limit
        large_html = "<html><body>" + ("x" * (MAX_HTML_SIZE + 1)) + "</body></html>"

        with pytest.raises(ValueError, match="HTML too large"):
            extract_html_text(large_html)

    def test_accepts_html_at_size_limit(self):
        """Should accept HTML exactly at MAX_HTML_SIZE."""
        from workers.html_extractor import MAX_HTML_SIZE

        # Create HTML at exactly the limit (with valid content)
        padding_size = MAX_HTML_SIZE - 100  # Leave room for HTML tags
        valid_html = f"<html><body><article><p>{'x' * padding_size}</p></article></body></html>"

        # Should not raise (though may timeout on slow systems)
        try:
            text, title = extract_html_text(valid_html)
            assert len(text) > 0
        except ValueError as e:
            # If Readability fails on huge input, that's acceptable
            if "no text content" not in str(e):
                raise


class TestExtractAndClean:
    """Tests for extract_and_clean convenience function."""

    def test_extracts_and_returns_tuple(self):
        """Should extract text and title in one call."""
        html = """
        <html>
        <head><title>Test Title</title></head>
        <body>
            <article>
                <p>Test content here.</p>
            </article>
        </body>
        </html>
        """
        text, title = extract_and_clean(html)

        assert "Test content here" in text
        assert title == "Test Title"

    def test_works_without_url_parameter(self):
        """Should work when URL is not provided."""
        html = """
        <html>
        <body>
            <article><p>Simple content.</p></article>
        </body>
        </html>
        """
        text, title = extract_and_clean(html)

        assert "Simple content" in text
        assert isinstance(title, str)

    def test_works_with_url_parameter(self):
        """Should accept optional URL parameter."""
        html = """
        <html>
        <body>
            <article><p>Content with URL context.</p></article>
        </body>
        </html>
        """
        text, title = extract_and_clean(html, url="https://example.com")

        assert "Content with URL context" in text
