using ECommerce.Shared.Common.Models;
using FluentValidation;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using System.Net;
using System.Text.Json;

namespace ECommerce.Shared.Common.Middleware;

public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "An unexpected error occurred");
            await HandleExceptionAsync(context, ex);
        }
    }

    private static async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        context.Response.ContentType = "application/json";

        var response = new ApiResponse();

        switch (exception)
        {
            case ValidationException validationEx:
                response.StatusCode = (int)HttpStatusCode.BadRequest;
                response.Message = "Validation failed";
                response.Errors = validationEx.Errors.Select(e => e.ErrorMessage).ToList();
                break;
            case KeyNotFoundException:
                response.StatusCode = (int)HttpStatusCode.NotFound;
                response.Message = "Resource not found";
                break;
            case UnauthorizedAccessException:
                response.StatusCode = (int)HttpStatusCode.Unauthorized;
                response.Message = "Unauthorized access";
                break;
            case ArgumentException argEx:
                response.StatusCode = (int)HttpStatusCode.BadRequest;
                response.Message = argEx.Message;
                break;
            default:
                response.StatusCode = (int)HttpStatusCode.InternalServerError;
                response.Message = "An internal server error occurred";
                break;
        }

        context.Response.StatusCode = response.StatusCode;

        var jsonResponse = JsonSerializer.Serialize(response, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        });

        await context.Response.WriteAsync(jsonResponse);
    }
}