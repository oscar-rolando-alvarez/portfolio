namespace ECommerce.Shared.Common.Models;

public class ApiResponse<T>
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public T? Data { get; set; }
    public List<string> Errors { get; set; } = new();
    public int StatusCode { get; set; }

    public static ApiResponse<T> SuccessResult(T data, string message = "Success")
    {
        return new ApiResponse<T>
        {
            Success = true,
            Message = message,
            Data = data,
            StatusCode = 200
        };
    }

    public static ApiResponse<T> FailureResult(string message, int statusCode = 400)
    {
        return new ApiResponse<T>
        {
            Success = false,
            Message = message,
            StatusCode = statusCode
        };
    }

    public static ApiResponse<T> FailureResult(List<string> errors, string message = "Validation failed", int statusCode = 400)
    {
        return new ApiResponse<T>
        {
            Success = false,
            Message = message,
            Errors = errors,
            StatusCode = statusCode
        };
    }
}

public class ApiResponse : ApiResponse<object>
{
    public static ApiResponse SuccessResult(string message = "Success")
    {
        return new ApiResponse
        {
            Success = true,
            Message = message,
            StatusCode = 200
        };
    }

    public static new ApiResponse FailureResult(string message, int statusCode = 400)
    {
        return new ApiResponse
        {
            Success = false,
            Message = message,
            StatusCode = statusCode
        };
    }
}