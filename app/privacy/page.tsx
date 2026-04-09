export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">プライバシーポリシー</h1>
      <p className="text-sm text-gray-500 mb-6">最終更新日: 2026年4月9日</p>

      <div className="prose prose-sm text-gray-700 space-y-6">
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-2">1. 運営者</h2>
          <p>本サービス「モール一括管理くん」（以下「本サービス」）は、Senjin Holdings株式会社（以下「当社」）が運営する社内業務支援ツールです。</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-2">2. 収集する情報</h2>
          <p>本サービスでは、以下の情報を収集・利用します。</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>TikTok / Instagram アカウント情報（ユーザー名、プロフィール画像、アクセストークン）</li>
            <li>TikTok / Instagram 動画・リールの再生数、エンゲージメントデータ</li>
            <li>Amazon、楽天、Qoo10 の売上データ</li>
            <li>ログインID・パスワード（本サービスの認証用）</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-2">3. 情報の利用目的</h2>
          <p>収集した情報は、以下の目的で利用します。</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>SNSアカウントの動画パフォーマンス分析</li>
            <li>EC売上データの一元管理・分析</li>
            <li>アカウント認証およびトークン管理</li>
            <li>サービスの改善・運用</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-2">4. 情報の保存</h2>
          <p>データは Google Cloud Platform（Firebase Firestore、BigQuery）および Vercel 上に保存されます。適切なアクセス制御により保護されています。</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-2">5. 第三者提供</h2>
          <p>収集した情報は、法令に基づく場合を除き、第三者に提供しません。</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-2">6. 外部サービスとの連携</h2>
          <p>本サービスは以下の外部APIと連携します。</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>TikTok Business API（動画データ取得）</li>
            <li>Instagram Graph API / Instagram Business Login（リールデータ取得）</li>
            <li>Meta Platform API（認証・データ取得）</li>
          </ul>
          <p className="mt-2">これらのAPIを通じて取得した情報は、本プライバシーポリシーに従って管理されます。</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-2">7. データの削除</h2>
          <p>ユーザーは、アカウントリストページからアカウント情報を削除できます。削除されたデータは Firestore および BigQuery から完全に削除されます。</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-2">8. お問い合わせ</h2>
          <p>プライバシーに関するお問い合わせは、以下までご連絡ください。</p>
          <p className="mt-1">Senjin Holdings株式会社<br />メール: info@senjinholdings.com</p>
        </section>
      </div>

      <div className="mt-12 pt-6 border-t text-center">
        <a href="/" className="text-sm text-blue-600 hover:text-blue-800">ログインページに戻る</a>
      </div>
    </div>
  );
}
