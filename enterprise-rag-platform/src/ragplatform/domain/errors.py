"""Domain errors, mapped to HTTP problem responses at the API edge."""

from __future__ import annotations


class DomainError(Exception):
    code = "domain_error"
    status = 400


class NotFoundError(DomainError):
    code = "not_found"
    status = 404


class PermissionDeniedError(DomainError):
    code = "permission_denied"
    status = 403


class AuthenticationError(DomainError):
    code = "unauthenticated"
    status = 401


class UnsupportedDocumentError(DomainError):
    code = "unsupported_document"
    status = 415


class DocumentTooLargeError(DomainError):
    code = "document_too_large"
    status = 413


class ParseError(DomainError):
    code = "parse_error"
    status = 422


class ProviderError(DomainError):
    """An upstream model provider failed (timeout, 5xx, malformed response)."""

    code = "provider_error"
    status = 502
