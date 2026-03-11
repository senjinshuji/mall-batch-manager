# Mall Batch Manager

モール（Amazon・楽天・Qoo10）の売上データとTikTok動画分析を一元管理するダッシュボードアプリ。

## 本番URL

- **フロントエンド**: https://mall-batch-manager-eight.vercel.app/
- **バックエンド**: https://mall-batch-manager-backend-983678294034.asia-northeast1.run.app (Cloud Run / 現在停止中)

## 技術スタック

- **フロントエンド**: Next.js 14.2.15 (App Router, Client Components)
- **ホスティング**: Vercel
- **データベース**: Firebase Firestore (プロジェクト: `mall-batch-manager`)
- **バックエンド**: Express.js on Google Cloud Run (Firebase Admin SDK)
- **チャート**: Recharts (ComposedChart, Line, Bar, Area)
- **UI**: Tailwind CSS + Lucide React Icons

## ページ構成

### `/dashboard` - ダッシュボード
- 3モール（Amazon・楽天・Qoo10）の売上推移グラフ（積み上げ棒グラフ）
- モール内広告費・外部広告費（X・TikTok）の折れ線グラフ重ね表示
- チェックボックスで各モール・広告費の表示/非表示切り替え
- イベントフラグをグラフ上に🚩マーカーで表示
- 商品選択・期間選択・SKU絞り込み

### `/video-analytics` - 動画分析
- 商品選択でTikTokアカウント・動画データをFirestoreから直接取得
- **Daily推移チャート**: 再生数・投稿数・ER%の折れ線 + 3モール売上の棒グラフ（全てチェックボックスでオン/オフ）
- **イベントフラグ**: ダッシュボードと同様のフラグ表示（🚩マーカー + フラグリスト）
- **アカウント別サマリー表**: 総再生数・いいね・コメント・シェア・動画数・ER%
- **動画一覧テーブル**: ソート対応、30K以上は黄色/10K以上は青色ハイライト
- **動画詳細モーダル**: クリックで個別動画の日次推移チャート表示
  - 再生数（Area+グラデーション）
  - エンゲージメント（いいね・コメント・シェア）トグルボタン
  - モール売上重ね表示トグルボタン
  - 期間選択（デフォルト: 投稿日〜今日）

### `/products` - 商品管理
- 登録商品のCRUD（商品名・SKU名・各モールコード）
- **売上入稿** (CSV):
  - Amazon売上入稿（多様なCSVフォーマット対応、エンコーディング自動検出）
  - 楽天売上入稿（楽天RMS形式対応）
  - Qoo10売上入稿（日付・売上・売上個数のシンプル形式）
  - 各モールのテンプレートCSVダウンロード機能

### `/flags` - フラグ登録
- イベント・キャンペーンのフラグを登録（手動 + CSV一括登録）
- CSVフォーマット: `日付,イベント名,詳細`
- テンプレートCSVダウンロード対応
- ダッシュボードと動画分析のグラフ上に表示される

### `/external-data` - 外部データ連携
- TikTokアカウント連携（OAuth / 手動 / CSV一括登録）
- X広告費・TikTok広告費のCSVアップロード

### `/settings` - 設定

## Firestoreコレクション

| コレクション | 用途 | 読み取り | 書き込み |
|---|---|---|---|
| `registered_products` | 登録商品マスタ | 許可 | 許可 |
| `amazon_daily_sales` | Amazon日次売上 | 許可 | 拒否（APIのみ） |
| `rakuten_daily_sales` | 楽天日次売上 | 許可 | 拒否（APIのみ） |
| `product_sales` | Qoo10売上等 | 許可 | 拒否（APIのみ） |
| `tiktok_accounts` | TikTokアカウント | 許可 | 拒否（APIのみ） |
| `tiktok_videos` | TikTok動画データ | 許可 | 拒否（APIのみ） |
| `tiktok_video_daily_snapshots` | 動画日次スナップショット | 許可 | 拒否（APIのみ） |
| `event_flags` | イベントフラグ | 許可 | 許可 |
| `settings` | アプリ設定 | 許可 | 許可 |
| `sales_data` | 売上データ（旧） | 許可 | 拒否 |
| `batch_logs` | バッチログ | 許可 | 拒否 |
| `sync_logs` | 同期ログ | 許可 | 拒否 |

## バックエンドAPI（Cloud Run）

### 売上データ入稿
- `POST /amazon/import-sales-csv/:productId` - Amazon売上CSVインポート
- `POST /rakuten/import-sales-csv/:productId` - 楽天売上CSVインポート
- `POST /qoo10/import-sales-csv/:productId` - Qoo10売上CSVインポート

### 売上データ取得
- `GET /amazon/daily-sales/:productId` - Amazon日次売上取得
- `GET /rakuten/daily-sales/:productId` - 楽天日次売上取得

### TikTok連携
- `POST /tiktok/accounts/register` - アカウント手動登録
- `POST /tiktok/accounts/bulk-register-v2` - CSV一括登録
- `GET /tiktok/accounts/:productId` - アカウント一覧
- `POST /tiktok/sync-all-engagements/:productId` - エンゲージメント同期

### Qoo10連携
- `GET /qoo10/fetch-orders` - 注文データ取得
- `POST /qoo10/sync-sales` - 売上同期

## デモデータ

`scripts/seed-video-analytics-demo.js` でデモデータを投入可能:
- 商品: 「【デモ】モイスチャー美容液セット」(`demo-product-skincare-001`)
- TikTokアカウント: 3件
- 動画: 30件（バズ動画3本 50K-200K / 中ヒット5本 10K-50K / 通常22本）
- 日次スナップショット: 約1,356件（2025-12-01〜2026-03-10）
- 売上データ: 100日分（Amazon・楽天・Qoo10）

## 開発

```bash
# フロントエンド
npm install
npm run dev          # localhost:3000

# バックエンド
cd backend
npm install
npm run dev          # localhost:8080
```

## デプロイ

```bash
# フロントエンド（Vercel）
npx vercel --prod

# バックエンド（Cloud Run）
cd backend
gcloud run deploy mall-batch-manager-backend --source .
```

## 注意事項

- バックエンド（Cloud Run）は現在課金停止により停止中。売上CSV入稿はCloud Run復旧後に動作。
- 動画分析ページはFirestoreから直接読み取りしているため、バックエンドなしで動作。
- Firestoreセキュリティルールで書き込みが拒否されているコレクション（`amazon_daily_sales`等）への書き込みはバックエンド（Admin SDK）経由のみ。
