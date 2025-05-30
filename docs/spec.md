# Journal API 設計ドキュメント

## 概要

**プロジェクト名**: `journal`

Slackのtimesチャンネルのような、シンプルなジャーナリング機能を提供するREST API。
マルチユーザー対応、OAuth認証、添付ファイル機能を含む。

## 技術スタック

- **Runtime**: Cloudflare Workers
- **Framework**: Hono + Hono RPC（型安全API）
- **Database**: Cloudflare D1（SQLite）
- **ORM**: Drizzle ORM + Drizzle Kit（マイグレーション管理）
- **Authentication**: better-auth
- **File Storage**: Cloudflare R2
- **Frontend**: Preact（認証画面のみ、Static Assets配信）

## アーキテクチャ

```
┌─────────────┐    ┌─────────────────┐    ┌──────────────┐
│   Client    │───▶│ Cloudflare      │───▶│ Cloudflare   │
│             │    │ Workers + Hono  │    │ D1 Database  │
└─────────────┘    └─────────────────┘    └──────────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │ Cloudflare R2   │
                   │ (Attachments)   │
                   └─────────────────┘
```

## データベース設計

### ユーザー・認証関連

```sql
-- Users（better-authが管理）
users (
  id: text PRIMARY KEY,
  email: text UNIQUE NOT NULL,
  name: text NOT NULL,
  email_verified: boolean DEFAULT false,
  image: text,
  created_at: timestamp NOT NULL,
  updated_at: timestamp NOT NULL
)

-- Sessions（better-authが管理）
sessions (
  id: text PRIMARY KEY,
  expires_at: timestamp NOT NULL,
  user_id: text NOT NULL REFERENCES users(id),
  -- その他better-authフィールド
)

-- OAuth Clients
oauth_clients (
  id: text PRIMARY KEY,
  client_id: text UNIQUE NOT NULL,
  client_secret: text NOT NULL,
  name: text NOT NULL,
  redirect_uris: text NOT NULL, -- JSON array
  created_at: timestamp NOT NULL
)

-- OAuth Tokens
oauth_tokens (
  id: text PRIMARY KEY,
  access_token: text UNIQUE NOT NULL,
  refresh_token: text,
  client_id: text NOT NULL REFERENCES oauth_clients(id),
  user_id: text NOT NULL REFERENCES users(id),
  scope: text,
  expires_at: timestamp NOT NULL,
  created_at: timestamp NOT NULL
)
```

### ジャーナル関連

```sql
-- Journal Entries（非公開のみ）
journal_entries (
  id: text PRIMARY KEY,
  user_id: text NOT NULL REFERENCES users(id),
  content: text NOT NULL, -- Markdown形式
  created_at: timestamp NOT NULL,
  updated_at: timestamp NOT NULL
)

-- Attachments
attachments (
  id: text PRIMARY KEY,
  journal_entry_id: text NOT NULL REFERENCES journal_entries(id),
  filename: text NOT NULL,
  original_filename: text NOT NULL,
  mime_type: text NOT NULL,
  size: integer NOT NULL,
  r2_key: text NOT NULL, -- R2でのオブジェクトキー
  created_at: timestamp NOT NULL
)
```

## API設計

### 認証

- **GET** `/auth/signin` - サインイン画面（Preact製静的HTML）
- **GET** `/auth/signup` - サインアップ画面（Preact製静的HTML）
- **POST** `/auth/signin/email` - メール/パスワードサインイン
- **POST** `/auth/signup/email` - メール/パスワードサインアップ
- **GET** `/auth/signin/google` - Google OAuth
- **GET** `/auth/signin/github` - GitHub OAuth

### OAuth

- **GET** `/oauth/authorize` - 認可エンドポイント
- **POST** `/oauth/authorize` - 認可決定処理
- **POST** `/oauth/token` - トークン交換

### ジャーナル

すべて認証必須、自分のエントリのみアクセス可能

- **GET** `/journal` - エントリ一覧取得
  - Query: `page`, `limit`
- **POST** `/journal` - 新規エントリ作成
  - Body: `{ content: string }`
- **GET** `/journal/:id` - 特定エントリ取得
- **PUT** `/journal/:id` - エントリ更新
  - Body: `{ content: string }`
- **DELETE** `/journal/:id` - エントリ削除
- **GET** `/journal/search` - エントリ検索
  - Query: `q`, `page`, `limit`

### 添付ファイル

- **POST** `/journal/:id/attachments` - ファイルアップロード
  - Content-Type: `multipart/form-data`
- **GET** `/attachments/:id` - ファイル取得（認証プロキシ）
- **DELETE** `/attachments/:id` - ファイル削除

## 認証方式

### 1. Session認証（Web UI用）

- better-authのセッション管理
- Cookieベース

### 2. OAuth 2.0（外部システム用）

- Authorization Code Grant
- Bearer Token認証

## ファイル管理

### ストレージ戦略

- **Cloudflare R2**: 全ての添付ファイル
- **D1**: ファイルメタデータのみ

### ファイル構成

```
R2 Bucket: journal-attachments
├── attachments/
│   ├── {userId}/
│   │   ├── {journalEntryId}/
│   │   │   ├── {fileId}
```

### Markdown内での参照

```markdown
![画像の説明](attachment:file-id-123)
[PDFファイル](attachment:file-id-456)
```

### ファイル制限

- **最大サイズ**: 10MB
- **許可形式**:
  - 画像: JPEG, PNG, GIF, WebP
  - 文書: PDF, TXT, Markdown, Word
- **セキュリティ**: アップロード時のMIMEタイプ検証

## 全文検索

### Phase 1: シンプル検索

```sql
-- LIKE検索による部分一致
SELECT * FROM journal_entries 
WHERE user_id = ? AND content LIKE '%keyword%'
ORDER BY created_at DESC
```

### 将来の改善候補

- SQLite FTS5の活用
- タグ機能（`#tag`）
- 日付範囲検索
- 外部検索サービス（Algolia等）

## セキュリティ

### 認証・認可

- 全APIエンドポイントで認証必須
- ユーザーは自分のデータのみアクセス可能
- OAuth scopeによる権限制御

### ファイルセキュリティ

- 添付ファイルアクセス時の所有者チェック
- ファイル形式・サイズ制限
- R2へのダイレクトアクセス防止（プロキシ経由のみ）

### レート制限

- API呼び出し制限（将来実装）
- ファイルアップロード制限

## デプロイ・運用

### 開発環境

```bash
# 開発サーバー起動
npm run dev

# D1マイグレーション（ローカル）
npm run db:migrate

# マイグレーションファイル生成
npm run db:generate
```

### 本番環境

```bash
# デプロイ
npm run deploy

# D1マイグレーション（本番）
wrangler d1 migrations apply journal-db
```

### 環境変数

```toml
# wrangler.toml
[vars]
BETTER_AUTH_SECRET = "your-secret-key"
BETTER_AUTH_URL = "https://your-domain.workers.dev"
GOOGLE_CLIENT_ID = "..."
GOOGLE_CLIENT_SECRET = "..."
GITHUB_CLIENT_ID = "..."
GITHUB_CLIENT_SECRET = "..."

[[d1_databases]]
binding = "DB"
database_name = "journal-db"

[[r2_buckets]]
binding = "ATTACHMENTS_BUCKET"
bucket_name = "journal-attachments"
```

## API型定義（Hono RPC用）

```typescript
// クライアント側で使用
import { hc } from 'hono/client'
import type { AppType } from './server'

const client = hc<AppType>('https://api.example.com')

// 型安全なAPI呼び出し
const response = await client.journal.$post({
  json: { content: "今日の振り返り..." }
})
```

## 今後の拡張予定

### 短期的

- 基本機能の実装・テスト
- エラーハンドリングの強化
- ログ・モニタリングの追加

### 中長期的

- 検索機能の改善
- タグ機能
- エクスポート機能
- チーム共有機能（必要に応じて）
- モバイルアプリ対応
