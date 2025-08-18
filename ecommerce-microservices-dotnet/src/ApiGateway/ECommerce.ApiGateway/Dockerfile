FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 80
EXPOSE 443

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["src/ApiGateway/ECommerce.ApiGateway/ECommerce.ApiGateway.csproj", "src/ApiGateway/ECommerce.ApiGateway/"]
RUN dotnet restore "src/ApiGateway/ECommerce.ApiGateway/ECommerce.ApiGateway.csproj"
COPY . .
WORKDIR "/src/src/ApiGateway/ECommerce.ApiGateway"
RUN dotnet build "ECommerce.ApiGateway.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "ECommerce.ApiGateway.csproj" -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "ECommerce.ApiGateway.dll"]