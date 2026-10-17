namespace DocumentManagement.Application.Common;

public sealed class NotFoundException(string resource, object key)
    : Exception($"{resource} '{key}' was not found.");

public sealed class ForbiddenAccessException(string message)
    : Exception(message);

/// <summary>Raised when an optional capability (for example AI summarization) is not configured.</summary>
public sealed class FeatureUnavailableException(string message)
    : Exception(message);
