export default function TermsOfServicePage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">利用規約</h1>
      <p className="text-sm text-gray-500 mb-6">最終更新日: 2026年4月9日</p>

      <div className="prose prose-sm text-gray-700 space-y-6">
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-2">第1条（適用）</h2>
          <p>本規約は、Senjin Holdings株式会社（以下「当社」）が提供する社内業務支援ツール「モール一括管理くん」（以下「本サービス」）の利用に関して適用されます。</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-2">第2条（サービス内容）</h2>
          <p>本サービスは、以下の機能を提供します。</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>TikTok / Instagram アカウントの管理</li>
            <li>動画・リールのパフォーマンス分析（再生数、エンゲージメント等）</li>
            <li>EC モール（Amazon、楽天、Qoo10）の売上データ管理</li>
            <li>SNSアカウントのトークン管理・自動更新</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-2">第3条（利用資格）</h2>
          <p>本サービスは、当社の従業員および当社が承認した関係者のみが利用できます。</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-2">第4条（アカウント管理）</h2>
          <p>ユーザーは、本サービスのログインID・パスワードを適切に管理する責任を負います。第三者への共有は禁止します。</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-2">第5条（外部サービス連携）</h2>
          <p>本サービスは TikTok Business API、Instagram Graph API、Meta Platform API と連携します。これらの外部サービスの利用にあたっては、各サービスの利用規約にも従うものとします。</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-2">第6条（禁止事項）</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>本サービスの不正利用</li>
            <li>取得したデータの無断外部公開</li>
            <li>サービスの逆コンパイルまたはリバースエンジニアリング</li>
            <li>他のユーザーへのなりすまし</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-2">第7条（免責事項）</h2>
          <p>当社は、本サービスの正確性・完全性・可用性について保証しません。外部APIの仕様変更やサービス停止により機能が制限される場合があります。</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-2">第8条（データの削除）</h2>
          <p>ユーザーは、本サービスの機能を通じてアカウント情報および関連データの削除を要求できます。当社は合理的な期間内にデータを削除します。</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-2">第9条（規約の変更）</h2>
          <p>当社は、必要に応じて本規約を変更できるものとします。変更後の規約は本ページへの掲載をもって効力を生じます。</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-800 mt-6 mb-2">第10条（お問い合わせ）</h2>
          <p>本規約に関するお問い合わせは、以下までご連絡ください。</p>
          <p className="mt-1">Senjin Holdings株式会社<br />メール: info@senjinholdings.com</p>
        </section>
      </div>

      <div className="mt-12 pt-6 border-t text-center">
        <a href="/" className="text-sm text-blue-600 hover:text-blue-800">ログインページに戻る</a>
      </div>
    </div>
  );
}
