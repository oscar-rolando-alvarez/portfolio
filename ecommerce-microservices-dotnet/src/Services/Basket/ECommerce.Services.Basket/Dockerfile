FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 80
EXPOSE 443

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["src/Services/Basket/ECommerce.Services.Basket/ECommerce.Services.Basket.csproj", "src/Services/Basket/ECommerce.Services.Basket/"]
COPY ["src/Shared/ECommerce.Shared.Common/ECommerce.Shared.Common.csproj", "src/Shared/ECommerce.Shared.Common/"]
COPY ["src/Shared/ECommerce.Shared.Events/ECommerce.Shared.Events.csproj", "src/Shared/ECommerce.Shared.Events/"]
COPY ["src/Shared/ECommerce.Shared.Contracts/ECommerce.Shared.Contracts.csproj", "src/Shared/ECommerce.Shared.Contracts/"]
RUN dotnet restore "src/Services/Basket/ECommerce.Services.Basket/ECommerce.Services.Basket.csproj"
COPY . .
WORKDIR "/src/src/Services/Basket/ECommerce.Services.Basket"
RUN dotnet build "ECommerce.Services.Basket.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "ECommerce.Services.Basket.csproj" -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "ECommerce.Services.Basket.dll"]