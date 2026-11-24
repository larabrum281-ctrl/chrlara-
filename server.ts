import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import {getApps, initializeApp, cert, type App} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';

dotenv.config();

interface FirebaseAppletConfig {
  projectId: string;
  storageBucket?: string;
  firestoreDatabaseId?: string;
}

interface VaultRecord {
  instantId: string;
  senderId: string;
  recipientId: string;
  durationSeconds: number;
  storagePath: string;
  mimeType: string;
  status: 'unopened' | 'viewing' | 'viewed' | 'expired';
  createdAtMs: number;
  expiresAtMs: number;
  viewedAtMs: number | null;
  viewTokenHash: string | null;
  viewTokenExpiresAtMs: number | null;
  viewTokenUsed: boolean;
}

interface AuthedRequest extends express.Request {
  uid?: string;
  emailVerified?: boolean;
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB
const CLEANUP_INTERVAL_MS = 30_000;

const rootDir = process.cwd();
const vaultDir = path.resolve(rootDir, '.flash-vault');
const mediaDir = path.resolve(vaultDir, 'media');
const metaDir = path.resolve(vaultDir, 'meta');
fs.mkdirSync(mediaDir, {recursive: true});
fs.mkdirSync(metaDir, {recursive: true});

function loadAppletConfig(): FirebaseAppletConfig {
  const envProjectId = process.env.VITE_FIREBASE_PROJECT_ID;
  const configPath = path.resolve(rootDir, 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as FirebaseAppletConfig;
    return {
      projectId: envProjectId || raw.projectId,
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || raw.storageBucket,
      firestoreDatabaseId:
        process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || raw.firestoreDatabaseId,
    };
  }
  return {
    projectId: envProjectId || '',
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    firestoreDatabaseId: process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID,
  };
}

const firebaseConfig = loadAppletConfig();

let adminApp: App | null = null;
let hasServiceAccount = false;

if (firebaseConfig.projectId) {
  const existingApps = getApps();
  if (existingApps.length > 0) {
    adminApp = existingApps[0];
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      adminApp = initializeApp({
        credential: cert(serviceAccount),
        projectId: firebaseConfig.projectId,
        storageBucket: firebaseConfig.storageBucket,
      });
      hasServiceAccount = true;
    } catch (err) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON, falling back to projectId-only Admin init:', err);
      adminApp = initializeApp({projectId: firebaseConfig.projectId});
    }
  } else {
    // Starter-tier / token-verification mode (requires zero IAM)
    adminApp = initializeApp({projectId: firebaseConfig.projectId});
  }
}

function safeVaultPath(baseDir: string, filename: string): string {
  const cleanName = path.basename(filename);
  const resolved = path.resolve(baseDir, cleanName);
  if (!resolved.startsWith(baseDir + path.sep)) {
    throw new Error('Invalid vault path');
  }
  return resolved;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function readVaultRecord(instantId: string): VaultRecord | null {
  if (!VALID_ID_REGEX.test(instantId)) return null;
  const metaPath = safeVaultPath(metaDir, `${instantId}.json`);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as VaultRecord;
  } catch {
    return null;
  }
}

function writeVaultRecord(record: VaultRecord): void {
  const metaPath = safeVaultPath(metaDir, `${record.instantId}.json`);
  fs.writeFileSync(metaPath, JSON.stringify(record), 'utf8');
}

function deleteVaultMedia(instantId: string): void {
  if (!VALID_ID_REGEX.test(instantId)) return;
  const mediaPath = safeVaultPath(mediaDir, `${instantId}.bin`);
  if (fs.existsSync(mediaPath)) {
    try {
      fs.unlinkSync(mediaPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

async function deleteStorageObjectIfConfigured(storagePath: string): Promise<void> {
  if (!hasServiceAccount || !adminApp || !storagePath || !firebaseConfig.storageBucket) return;
  try {
    const bucket = getStorage(adminApp).bucket(firebaseConfig.storageBucket);
    await bucket.file(storagePath).delete({ignoreNotFound: true});
  } catch {
    // Non-fatal in case Storage object was already deleted by client
  }
}

async function markFirestoreExpiredIfConfigured(instantId: string): Promise<void> {
  if (!hasServiceAccount || !adminApp) return;
  try {
    const db =
      firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
        ? getFirestore(adminApp, firebaseConfig.firestoreDatabaseId)
        : getFirestore(adminApp);
    const ref = db.collection('instants').doc(instantId);
    const snap = await ref.get();
    if (snap.exists && snap.data()?.status === 'unopened') {
      await ref.update({
        status: 'expired',
        updatedAt: new Date(),
      });
    }
  } catch {
    // Non-fatal
  }
}

// In-process lock map to serialize view-once state transitions per instantId
const instantLocks = new Set<string>();

async function runSweep(): Promise<void> {
  const now = Date.now();
  let files: string[] = [];
  try {
    files = fs.readdirSync(metaDir);
  } catch {
    return;
  }

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const instantId = file.slice(0, -5);
    if (!VALID_ID_REGEX.test(instantId) || instantLocks.has(instantId)) continue;
    const record = readVaultRecord(instantId);
    if (!record) continue;

    if (record.status === 'unopened' && now >= record.expiresAtMs) {
      record.status = 'expired';
      writeVaultRecord(record);
      deleteVaultMedia(instantId);
      await deleteStorageObjectIfConfigured(record.storagePath);
      await markFirestoreExpiredIfConfigured(instantId);
    } else if (
      (record.status === 'viewed' || record.status === 'expired') &&
      now >= (record.viewedAtMs ?? record.createdAtMs) + 60_000
    ) {
      deleteVaultMedia(instantId);
      await deleteStorageObjectIfConfigured(record.storagePath);
    }
  }
}

setInterval(() => {
  void runSweep();
}, CLEANUP_INTERVAL_MS).unref();

async function requireFirebaseAuth(
  req: AuthedRequest,
  res: express.Response,
  next: express.NextFunction
): Promise<void> {
  if (!adminApp) {
    res.status(503).json({error: 'Serviço Firebase não configurado no servidor.'});
    return;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({error: 'Token de autenticação ausente.'});
    return;
  }
  const idToken = authHeader.slice(7).trim();
  if (!idToken) {
    res.status(401).json({error: 'Token de autenticação inválido.'});
    return;
  }
  try {
    const decoded = await getAuth(adminApp).verifyIdToken(idToken);
    req.uid = decoded.uid;
    req.emailVerified = decoded.email_verified === true;
    next();
  } catch {
    res.status(401).json({error: 'Sessão expirada ou token inválido.'});
  }
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);

  // Security headers compatible with Render HTTPS & Firebase Auth popup
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
  });

  app.use(express.json({limit: '6mb'}));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'flash',
      adminStorageCleanup: hasServiceAccount,
      timestamp: new Date().toISOString(),
    });
  });

  // Register a new view-once instant media payload in the backend vault
  app.post('/api/instants/register', requireFirebaseAuth, (req: AuthedRequest, res) => {
    if (!req.emailVerified) {
      res.status(403).json({error: 'Verifique seu e-mail antes de enviar instantes.'});
      return;
    }

    const {instantId, recipientId, durationSeconds, expiresAtMs, storagePath, imageDataUrl} =
      req.body ?? {};

    if (typeof instantId !== 'string' || !VALID_ID_REGEX.test(instantId)) {
      res.status(400).json({error: 'Identificador do instante inválido.'});
      return;
    }
    if (
      typeof recipientId !== 'string' ||
      !VALID_ID_REGEX.test(recipientId) ||
      recipientId === req.uid
    ) {
      res.status(400).json({error: 'Destinatário inválido.'});
      return;
    }

    const duration = Number(durationSeconds);
    if (!Number.isInteger(duration) || duration < 3 || duration > 15) {
      res.status(400).json({error: 'Duração deve estar entre 3 e 15 segundos.'});
      return;
    }

    const now = Date.now();
    const expiry = Number(expiresAtMs);
    if (!Number.isFinite(expiry) || expiry <= now || expiry > now + 48 * 60 * 60 * 1000) {
      res.status(400).json({error: 'Data de expiração inválida.'});
      return;
    }

    if (typeof imageDataUrl !== 'string') {
      res.status(400).json({error: 'Imagem obrigatória.'});
      return;
    }

    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(imageDataUrl);
    if (!match) {
      res.status(400).json({error: 'Formato de imagem inválido (use JPEG, PNG ou WebP).'});
      return;
    }

    const mimeType = match[1];
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
      res.status(413).json({error: 'A imagem excede o limite de 4 MB.'});
      return;
    }

    if (readVaultRecord(instantId)) {
      res.status(409).json({error: 'Identificador de instante já registrado.'});
      return;
    }

    const cleanStoragePath =
      typeof storagePath === 'string' && storagePath.length <= 512 ? storagePath : '';

    const record: VaultRecord = {
      instantId,
      senderId: req.uid!,
      recipientId,
      durationSeconds: duration,
      storagePath: cleanStoragePath,
      mimeType,
      status: 'unopened',
      createdAtMs: now,
      expiresAtMs: expiry,
      viewedAtMs: null,
      viewTokenHash: null,
      viewTokenExpiresAtMs: null,
      viewTokenUsed: false,
    };

    const mediaPath = safeVaultPath(mediaDir, `${instantId}.bin`);
    fs.writeFileSync(mediaPath, buffer);
    writeVaultRecord(record);

    res.status(201).json({ok: true, instantId});
  });

  // Backend-enforced first-view gate: issues a single-use view token once and blocks any replay
  app.post('/api/instants/:instantId/open', requireFirebaseAuth, (req: AuthedRequest, res) => {
    const {instantId} = req.params;
    if (!VALID_ID_REGEX.test(instantId)) {
      res.status(400).json({error: 'ID inválido.'});
      return;
    }
    if (instantLocks.has(instantId)) {
      res.status(409).json({error: 'Abertura em andamento.'});
      return;
    }

    instantLocks.add(instantId);
    try {
      const record = readVaultRecord(instantId);
      if (!record) {
        res.status(404).json({error: 'Instante não encontrado ou já destruído.'});
        return;
      }
      if (record.recipientId !== req.uid) {
        res.status(403).json({error: 'Você não tem permissão para abrir este instante.'});
        return;
      }

      const now = Date.now();
      if (now >= record.expiresAtMs || record.status === 'expired') {
        record.status = 'expired';
        writeVaultRecord(record);
        deleteVaultMedia(instantId);
        void deleteStorageObjectIfConfigured(record.storagePath);
        res.status(410).json({error: 'Este instante expirou e foi removido automaticamente.'});
        return;
      }

      if (record.status !== 'unopened') {
        res.status(410).json({error: 'Visualização única esgotada. Este instante já foi aberto.'});
        return;
      }

      const viewToken = crypto.randomBytes(24).toString('hex');
      record.status = 'viewing';
      record.viewedAtMs = now;
      record.viewTokenHash = hashToken(viewToken);
      record.viewTokenExpiresAtMs = now + (record.durationSeconds + 20) * 1000;
      record.viewTokenUsed = false;
      writeVaultRecord(record);

      res.json({
        ok: true,
        viewToken,
        durationSeconds: record.durationSeconds,
        viewedAtMs: now,
      });
    } finally {
      instantLocks.delete(instantId);
    }
  });

  // Single-use protected media stream: validates bearer auth + one-time viewToken, burns token on delivery
  app.get('/api/instants/:instantId/media', requireFirebaseAuth, (req: AuthedRequest, res) => {
    const {instantId} = req.params;
    const rawToken = req.headers['x-flash-view-token'];
    const viewToken = typeof rawToken === 'string' ? rawToken.trim() : '';

    if (!VALID_ID_REGEX.test(instantId) || !viewToken) {
      res.status(400).json({error: 'Parâmetros inválidos.'});
      return;
    }

    const record = readVaultRecord(instantId);
    if (!record) {
      res.status(404).json({error: 'Mídia não encontrada.'});
      return;
    }
    if (record.recipientId !== req.uid) {
      res.status(403).json({error: 'Acesso negado.'});
      return;
    }

    const now = Date.now();
    if (
      record.viewTokenUsed ||
      !record.viewTokenHash ||
      !record.viewTokenExpiresAtMs ||
      now > record.viewTokenExpiresAtMs ||
      record.viewTokenHash !== hashToken(viewToken)
    ) {
      res.status(410).json({error: 'Token de visualização única já utilizado ou expirado.'});
      return;
    }

    const mediaPath = safeVaultPath(mediaDir, `${instantId}.bin`);
    if (!fs.existsSync(mediaPath)) {
      res.status(410).json({error: 'Arquivo de mídia já destruído.'});
      return;
    }

    // Burn the single-use token immediately before streaming
    record.viewTokenUsed = true;
    record.status = 'viewed';
    writeVaultRecord(record);

    const fileBuffer = fs.readFileSync(mediaPath);
    res.setHeader('Content-Type', record.mimeType);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(fileBuffer);

    // Destroy local media buffer right after delivery
    deleteVaultMedia(instantId);
    void deleteStorageObjectIfConfigured(record.storagePath);
  });

  // Finalize view and ensure immediate media destruction
  app.post('/api/instants/:instantId/complete', requireFirebaseAuth, (req: AuthedRequest, res) => {
    const {instantId} = req.params;
    if (!VALID_ID_REGEX.test(instantId)) {
      res.status(400).json({error: 'ID inválido.'});
      return;
    }
    const record = readVaultRecord(instantId);
    if (!record) {
      res.json({ok: true});
      return;
    }
    if (record.recipientId !== req.uid && record.senderId !== req.uid) {
      res.status(403).json({error: 'Acesso negado.'});
      return;
    }
    record.status = 'viewed';
    record.viewTokenUsed = true;
    writeVaultRecord(record);
    deleteVaultMedia(instantId);
    void deleteStorageObjectIfConfigured(record.storagePath);
    res.json({ok: true});
  });

  // Explicit cleanup endpoint when participant deletes an instant
  app.delete('/api/instants/:instantId', requireFirebaseAuth, (req: AuthedRequest, res) => {
    const {instantId} = req.params;
    if (!VALID_ID_REGEX.test(instantId)) {
      res.status(400).json({error: 'ID inválido.'});
      return;
    }
    const record = readVaultRecord(instantId);
    if (record) {
      if (record.senderId !== req.uid && record.recipientId !== req.uid) {
        res.status(403).json({error: 'Acesso negado.'});
        return;
      }
      deleteVaultMedia(instantId);
      const metaPath = safeVaultPath(metaDir, `${instantId}.json`);
      if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
      void deleteStorageObjectIfConfigured(record.storagePath);
    }
    res.json({ok: true});
  });

  if (process.env.NODE_ENV !== 'production') {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(rootDir, 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`FLASH server listening on http://0.0.0.0:${port}`);
  });
}

void startServer();
