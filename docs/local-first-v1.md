# BYD Skyrail — módulo documental local-first V1

## Objetivo
Permitir consulta de documentação técnica em tablets Android sem internet e sem armazenamento dos PDFs em nuvem.

## Arquitetura

```text
BYD Skyrail UI (HTML/CSS/JS)
        |
        +-- JsonDocumentRepository
        |      +-- documents.json empacotado
        |      +-- catálogo importado em armazenamento local
        |
        +-- DocumentFileService
        |      +-- Android: Capacitor Filesystem / Directory.Data
        |      +-- Web: IndexedDB apenas como fallback de desenvolvimento
        |
        +-- DocumentViewerService
        |      +-- PDF.js interno
        |
        +-- PackageImportService
               +-- ZIP via seletor de arquivos do Android
               +-- staging privado
               +-- manifest.json
               +-- documents.json
               +-- documents/*.pdf
```

Supabase continua sendo utilizado para autenticação, usuários e recursos administrativos online. O módulo documental não usa Supabase Storage e não baixa PDFs da nuvem.

## Catálogo

`documents.json`:

```json
{
  "schemaVersion": 1,
  "catalogVersion": "2026.08.001",
  "generatedAt": "2026-08-24T14:00:00-03:00",
  "packageVersion": "2026.08.001",
  "systems": [
    { "id": "energia", "name": "Energia", "active": true }
  ],
  "documents": [
    {
      "id": "doc-000123",
      "code": "17O-EL-00123",
      "title": "Diagrama Unifilar",
      "description": "Diagrama unifilar de alimentação",
      "system_id": "energia",
      "system_name": "Energia",
      "discipline": "Elétrica",
      "document_type": "Desenho",
      "revision": "D",
      "status": "active",
      "file": "doc-000123.pdf",
      "updated_at": "2026-08-24T14:00:00-03:00"
    }
  ]
}
```

Documentos `inactive` ou `cancelled` não entram na biblioteca normal.

## Pesquisa
A V1 carrega aproximadamente 1.000 registros em memória. O ranking do `JsonDocumentRepository` prioriza:

1. código exato normalizado;
2. início do código;
3. trecho do código;
4. início do título;
5. trecho do título;
6. descrição;
7. demais metadados.

Não há SQLite, FTS5 nem pesquisa dentro do conteúdo do PDF nesta versão.

## Pacote de atualização

```text
skyrail-update.zip
├── manifest.json
├── documents.json
└── documents/
    ├── doc-000001.pdf
    ├── doc-000002.pdf
    └── ...
```

`manifest.json` mínimo:

```json
{
  "packageVersion": "2026.08.001",
  "createdAt": "2026-08-24T14:00:00-03:00",
  "schemaVersion": 1,
  "catalogFile": "documents.json"
}
```

O importador extrai o ZIP em staging privado, valida manifesto, schema, IDs/códigos duplicados e presença de cada PDF ativo. O catálogo ativo só é substituído depois que os arquivos do novo pacote foram escritos. Falhas são apresentadas explicitamente e o staging é removido.

## Armazenamento Android
Os PDFs são escritos com `@capacitor/filesystem` em `Directory.Data`, sob o namespace lógico `skyrail/documents`. A interface utiliza IDs de documentos e nunca depende de pastas públicas como Downloads/Documents.

Nesta V1 não há AES/Android Keystore. Isso está deliberadamente reservado para uma versão posterior.

## PDF Viewer
O viewer usa `pdfjs-dist` empacotado no APK e oferece página atual/total, anterior/próxima e zoom. Não utiliza Chrome, Adobe ou fluxo de compartilhamento como caminho principal.

## Como gerar o Android
Pré-requisitos: Node.js compatível com Capacitor 8, Android Studio e SDK Android configurado.

Primeira preparação:

```bash
npm install
npm run build
npm run android:add
npm run android:sync
npm run android:open
```

Nas execuções seguintes:

```bash
npm install
npm run android:sync
npm run android:open
```

No Android Studio, selecione o dispositivo/tablet e execute o app. Para gerar um APK de teste, use **Build > Build APK(s)**. Para distribuição formal, configurar assinatura Android conforme a política corporativa.

## Versão web

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

A Netlify publica `dist/`.

## Atualização dos tablets
1. copiar `skyrail-update.zip` para mídia USB/USB-C ou local acessível pelo seletor Android;
2. no BYD Skyrail, ADMIN abre a área de Conferência/Auditoria;
3. selecionar **Importar atualização**;
4. selecionar o ZIP;
5. aguardar validação e importação;
6. o app recarrega o catálogo local.

## Limitações deliberadas da V1
- sem criptografia de PDFs;
- sem Android Keystore;
- sem assinatura digital de pacote;
- sem SHA-256 obrigatório;
- sem SQLite/FTS5;
- sem importação incremental sofisticada;
- sem Packager administrativo;
- sem pesquisa textual dentro dos PDFs.

## Evolução sugerida

### V1.1
- SHA-256 por arquivo;
- validação mais forte de espaço/integridade;
- recuperação mais detalhada de import interrompido.

### V1.2
- AES-GCM;
- Android Keystore;
- assinatura de manifesto;
- vínculo de pacote/dispositivo.

### V2
- SQLite;
- FTS5;
- atualização incremental;
- Packager;
- índice de conteúdo PDF.
