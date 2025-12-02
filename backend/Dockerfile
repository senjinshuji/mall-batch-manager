# Playwright用のベースイメージ
FROM mcr.microsoft.com/playwright:v1.57.0-noble AS builder

# 作業ディレクトリを設定
WORKDIR /app

# package.jsonとpackage-lock.jsonをコピー
COPY package*.json ./

# 開発依存関係も含めてインストール（ビルド用）
RUN npm ci

# ソースコードをコピー
COPY tsconfig.json ./
COPY src ./src

# TypeScriptをビルド
RUN npm run build

# 本番用ステージ（Playwrightイメージを使用）
FROM mcr.microsoft.com/playwright:v1.57.0-noble

WORKDIR /app

# 本番用依存関係のみインストール
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ビルド済みファイルをコピー
COPY --from=builder /app/dist ./dist

# ポート8080を公開（Cloud Runのデフォルト）
EXPOSE 8080

# 環境変数でポートを指定
ENV PORT=8080
ENV NODE_ENV=production

# アプリケーションを起動
CMD ["node", "dist/index.js"]
