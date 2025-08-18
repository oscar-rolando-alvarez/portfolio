FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 80
EXPOSE 443

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["src/Services/Identity/ECommerce.Services.Identity/ECommerce.Services.Identity.csproj", "src/Services/Identity/ECommerce.Services.Identity/"]
COPY ["src/Shared/ECommerce.Shared.Common/ECommerce.Shared.Common.csproj", "src/Shared/ECommerce.Shared.Common/"]
COPY ["src/Shared/ECommerce.Shared.Events/ECommerce.Shared.Events.csproj", "src/Shared/ECommerce.Shared.Events/"]
RUN dotnet restore "src/Services/Identity/ECommerce.Services.Identity/ECommerce.Services.Identity.csproj"
COPY . .
WORKDIR "/src/src/Services/Identity/ECommerce.Services.Identity"
RUN dotnet build "ECommerce.Services.Identity.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "ECommerce.Services.Identity.csproj" -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "ECommerce.Services.Identity.dll"]