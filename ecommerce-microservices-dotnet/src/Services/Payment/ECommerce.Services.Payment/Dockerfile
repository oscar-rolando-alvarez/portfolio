FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 80
EXPOSE 443

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["src/Services/Payment/ECommerce.Services.Payment/ECommerce.Services.Payment.csproj", "src/Services/Payment/ECommerce.Services.Payment/"]
COPY ["src/Shared/ECommerce.Shared.Common/ECommerce.Shared.Common.csproj", "src/Shared/ECommerce.Shared.Common/"]
COPY ["src/Shared/ECommerce.Shared.Events/ECommerce.Shared.Events.csproj", "src/Shared/ECommerce.Shared.Events/"]
COPY ["src/Shared/ECommerce.Shared.Contracts/ECommerce.Shared.Contracts.csproj", "src/Shared/ECommerce.Shared.Contracts/"]
RUN dotnet restore "src/Services/Payment/ECommerce.Services.Payment/ECommerce.Services.Payment.csproj"
COPY . .
WORKDIR "/src/src/Services/Payment/ECommerce.Services.Payment"
RUN dotnet build "ECommerce.Services.Payment.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "ECommerce.Services.Payment.csproj" -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "ECommerce.Services.Payment.dll"]