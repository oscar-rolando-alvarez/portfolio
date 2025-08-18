FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 80
EXPOSE 443

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["src/Services/Ordering/ECommerce.Services.Ordering/ECommerce.Services.Ordering.csproj", "src/Services/Ordering/ECommerce.Services.Ordering/"]
COPY ["src/Shared/ECommerce.Shared.Common/ECommerce.Shared.Common.csproj", "src/Shared/ECommerce.Shared.Common/"]
COPY ["src/Shared/ECommerce.Shared.Events/ECommerce.Shared.Events.csproj", "src/Shared/ECommerce.Shared.Events/"]
COPY ["src/Shared/ECommerce.Shared.Contracts/ECommerce.Shared.Contracts.csproj", "src/Shared/ECommerce.Shared.Contracts/"]
RUN dotnet restore "src/Services/Ordering/ECommerce.Services.Ordering/ECommerce.Services.Ordering.csproj"
COPY . .
WORKDIR "/src/src/Services/Ordering/ECommerce.Services.Ordering"
RUN dotnet build "ECommerce.Services.Ordering.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "ECommerce.Services.Ordering.csproj" -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "ECommerce.Services.Ordering.dll"]