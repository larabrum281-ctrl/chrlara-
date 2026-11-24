# FLASH — Rede Social de Instantes de Visualização Única

Aplicação web progressiva (PWA) e full-stack construída com React, Vite, Express e infraestrutura Firebase, preparada para hospedagem em produção na **Render**.

## Arquitetura do Projeto

- **Frontend (`src/`)**: React 19 + TypeScript + Tailwind CSS v4 + `vite-plugin-pwa` (Manifest, Service Worker, ícones PNG e Splash Screen).
- **Backend (`server.ts`)**: Servidor Express responsável por:
  - Verificar tokens JWT do Firebase Auth (`verifyIdToken`) em todas as rotas `/api/*`.
  - Controlar a **primeira visualização** dos instantes (`/api/instants/:id/open`), emitindo token de uso único e bloqueando reaberturas (`410 Gone`).
  - Entregar a imagem em rota protegida de uso único (`/api/instants/:id/media`) com cabeçalhos `Cache-Control: no-store`.
  - Executar limpeza automática de arquivos expirados (24h) ou já visualizados.
  - Servir o build SPA (`dist/index.html`) em produção com suporte a rotas client-side na Render.
- **Segurança Firebase**:
  - `firestore.rules`: Regras de segurança com isolamento de PII (`/users/{uid}/private/info`), validação de amizade para envio de instantes e travamento de estado terminal (`viewed`/`expired`).
  - `storage.rules`: Regras do Firebase Storage restringindo leitura e exclusão ao remetente e destinatário autorizado.
  - `firebase-blueprint.json`: Esquema canônico das coleções e entidades.

---

## Configuração do Firebase

1. **Firebase Authentication**:
   - No Console do Firebase, acesse **Authentication > Sign-in method**.
   - Ative **Google** (já configurado) e, caso deseje permitir cadastro por e-mail/senha, ative **Email/Password**.
   - Em **Authentication > Settings > Authorized domains**, adicione o domínio gerado pela Render (e seu domínio personalizado, se houver).
2. **Cloud Firestore e Security Rules**:
   - Aplique o conteúdo de `firestore.rules` na aba **Firestore Database > Rules** (ou via `firebase deploy --only firestore:rules`).
   - Se o Firestore solicitar índices compostos para consultas com `array-contains` ou `where`, utilize o link exibido no console do navegador para criá-los automaticamente.
3. **Firebase Storage**:
   - Ative o **Firebase Storage** no projeto e publique as regras de `storage.rules`.
4. **Firebase App Check (Opcional recomendado para produção)**:
   - Registre seu app web no **App Check** usando **reCAPTCHA Enterprise** e defina a chave pública em `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`.

---

## Publicação na Render

O repositório inclui o arquivo `render.yaml` configurado para deploy automático.

### Passos para Deploy na Render

1. Crie um novo **Web Service** na Render conectado ao seu repositório (ou use **Blueprints** para importar `render.yaml`).
2. Confirme os comandos de build e inicialização:
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `NODE_ENV=production node server.ts`
3. Configure as **Environment Variables** no painel da Render:
   - `NODE_ENV`: `production`
   - `APP_URL`: URL HTTPS pública do serviço na Render (ex.: `https://flash-app.onrender.com`)
   - `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_FIRESTORE_DATABASE_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID` (caso utilize outro projeto Firebase diferente de `firebase-applet-config.json`)
   - `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`: Chave do reCAPTCHA Enterprise para Firebase App Check (opcional)
   - `FIREBASE_SERVICE_ACCOUNT_JSON`: JSON da conta de serviço do Firebase (opcional, habilita exclusão direta de arquivos expirados no Firebase Storage pelo backend em produção)
4. **HTTPS e Domínio Personalizado**:
   - A Render provisiona certificados TLS/HTTPS automaticamente e redireciona HTTP para HTTPS.
   - Para domínio personalizado, adicione-o em **Settings > Custom Domains** na Render e autorize-o em **Firebase Authentication > Authorized domains**.
5. **Compatibilidade SPA**:
   - O `server.ts` redireciona qualquer rota não-API para `dist/index.html`, garantindo recarregamentos e links diretos sem erro 404.

---

## Desenvolvimento Local

```bash
npm install
npm run dev
```

Para validar tipos TypeScript e regras do Firestore:

```bash
npm run lint
npm run lint:rules
```
