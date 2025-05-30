# Journal API

Slackのtimesチャンネルのような、シンプルなジャーナリング機能を提供するREST API。

## 技術スタック

- **Runtime**: Cloudflare Workers
- **Framework**: Hono
- **Database**: Cloudflare D1（SQLite）
- **ORM**: Drizzle ORM
- **Authentication**: better-auth
- **File Storage**: Cloudflare R2

## セットアップ

### 1. 依存関係のインストール

```bash
pnpm install
```

### 2. Cloudflareアカウントの設定

`wrangler.jsonc`に適切なCloudflareアカウントIDを設定してください。

### 3. D1データベースの作成

```bash
pnpx wrangler d1 create journal-db
```

作成されたデータベースIDを`wrangler.jsonc`の`database_id`に設定してください。

### 4. R2バケットの作成

```bash
pnpx wrangler r2 bucket create journal-attachments
```

### 5. データベースマイグレーション

```bash
# マイグレーションファイルを生成
pnpm db:generate

# ローカル環境にマイグレーションを適用
pnpm db:migrate

# 本番環境にマイグレーションを適用
pnpm db:migrate:prod
```

### 6. 型定義の生成

```bash
pnpm cf-typegen
```

## 開発

### 開発サーバーの起動

```bash
pnpm dev
```

### デプロイ

```bash
pnpm deploy
```

## API エンドポイント

### 認証

- `POST /auth/signin/email` - メール/パスワードサインイン
- `POST /auth/signup/email` - メール/パスワードサインアップ
- `GET /auth/signin/google` - Google OAuth（設定済みの場合）
- `GET /auth/signin/github` - GitHub OAuth（設定済みの場合）

### ジャーナル（認証必須）

- `GET /journal` - エントリ一覧取得
- `POST /journal` - 新規エントリ作成
- `GET /journal/:id` - 特定エントリ取得
- `PUT /journal/:id` - エントリ更新
- `DELETE /journal/:id` - エントリ削除
- `GET /journal/search?q=keyword` - エントリ検索

### 添付ファイル（認証必須）

- `POST /journal/:id/attachments` - ファイルアップロード
- `GET /attachments/:id` - ファイル取得
- `DELETE /attachments/:id` - ファイル削除

### ユーザー管理（認証必須）

- `GET /user/profile` - プロフィール取得
- `PUT /user/profile` - プロフィール更新
- `POST /user/change-password` - パスワード変更
- `POST /user/request-password-reset` - パスワードリセット要求
- `POST /user/resend-verification` - メール認証再送信
- `DELETE /user/account` - アカウント削除（退会）

## 環境変数

`wrangler.jsonc`の`vars`セクションで以下を設定：

```json
{
  "vars": {
    "BETTER_AUTH_SECRET": "your-secret-key",
    "BETTER_AUTH_URL": "https://your-domain.workers.dev",
    "GOOGLE_CLIENT_ID": "optional",
    "GOOGLE_CLIENT_SECRET": "optional",
    "GITHUB_CLIENT_ID": "optional",
    "GITHUB_CLIENT_SECRET": "optional"
  }
}
```

## プロジェクト構造

```
src/
├── auth.ts              # better-auth設定
├── index.ts             # メインアプリケーション
├── db/
│   └── schema.ts        # データベーススキーマ
├── middleware/
│   └── auth.ts          # 認証ミドルウェア
└── routes/
    ├── journal.ts       # ジャーナルエントリAPI
    └── attachments.ts   # ファイルアップロードAPI
```
