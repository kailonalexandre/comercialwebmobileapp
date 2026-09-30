# API .NET do app Infinit Comercial. Contexto de build: a pasta backend/.
# global.json não é copiado: o SDK da imagem (11.0 preview/RC) é o que compila, sem depender do número exato do build.
FROM mcr.microsoft.com/dotnet/sdk:11.0-preview AS build
WORKDIR /src
COPY Directory.Build.props ./
COPY src/ src/
COPY db/ db/
RUN dotnet publish src/ComercialWeb.Mobile.Api/ComercialWeb.Mobile.Api.csproj -c Release -o /out /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:11.0-preview AS runtime
WORKDIR /app
COPY --from=build /out ./
ENV ASPNETCORE_URLS=http://+:8080 \
    DOTNET_EnableDiagnostics=0
EXPOSE 8080
# Usuário não-root da imagem (UID 1654). Segredos e chaves chegam por variável de ambiente e volumes, nunca na imagem.
USER $APP_UID
ENTRYPOINT ["dotnet", "ComercialWeb.Mobile.Api.dll"]
