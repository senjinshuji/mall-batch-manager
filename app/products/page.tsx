"use client";

import { useState, useRef, useEffect } from "react";
import { Package, Plus, Trash2, Edit2, Save, X, Upload, Download, ChevronDown } from "lucide-react";
import {
  RegisteredProduct,
  MallProduct,
  mockAmazonProducts,
  mockRakutenProducts,
  mockQoo10Products,
  mockRegisteredProducts,
} from "@/lib/mockData";

type NewProduct = {
  productName: string;
  amazonCode: string;
  rakutenCode: string;
  qoo10Code: string;
};

export default function ProductsPage() {
  const [products, setProducts] = useState<RegisteredProduct[]>(mockRegisteredProducts);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState<NewProduct>({
    productName: "",
    amazonCode: "",
    rakutenCode: "",
    qoo10Code: "",
  });
  const [editProduct, setEditProduct] = useState<NewProduct>({
    productName: "",
    amazonCode: "",
    rakutenCode: "",
    qoo10Code: "",
  });
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvSuccess, setCsvSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddProduct = () => {
    if (!newProduct.productName) return;

    const product: RegisteredProduct = {
      id: `prod-${Date.now()}`,
      ...newProduct,
    };

    setProducts([...products, product]);
    setNewProduct({
      productName: "",
      amazonCode: "",
      rakutenCode: "",
      qoo10Code: "",
    });
    setIsAdding(false);
  };

  const handleDeleteProduct = (id: string) => {
    setProducts(products.filter((p) => p.id !== id));
  };

  const handleStartEdit = (product: RegisteredProduct) => {
    setEditingId(product.id);
    setEditProduct({
      productName: product.productName,
      amazonCode: product.amazonCode,
      rakutenCode: product.rakutenCode,
      qoo10Code: product.qoo10Code,
    });
  };

  const handleSaveEdit = (id: string) => {
    setProducts(
      products.map((p) =>
        p.id === id
          ? {
              ...p,
              ...editProduct,
            }
          : p
      )
    );
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  // CSVテンプレートダウンロード
  const handleDownloadTemplate = () => {
    const headers = ["商品名", "Amazon商品コード", "楽天商品コード", "Qoo10商品コード"];
    const sampleData = [
      ["オーガニックシャンプー", "AMZ-001", "RKT-001", "Q10-001"],
      ["ヘアトリートメント", "AMZ-002", "RKT-002", ""],
    ];

    const csvContent = [
      headers.join(","),
      ...sampleData.map(row => row.join(","))
    ].join("\n");

    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "商品登録テンプレート.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // CSVファイル読み込み
  const handleCsvImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setCsvError(null);
    setCsvSuccess(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split(/\r?\n/).filter(line => line.trim());

        if (lines.length < 2) {
          setCsvError("CSVファイルにデータがありません（ヘッダー行のみ）");
          return;
        }

        // ヘッダー行をスキップしてデータを解析
        const newProducts: RegisteredProduct[] = [];
        const errors: string[] = [];

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          const values = line.split(",").map(v => v.trim().replace(/^["']|["']$/g, ""));

          if (values.length < 1 || !values[0]) {
            errors.push(`${i + 1}行目: 商品名が空です`);
            continue;
          }

          newProducts.push({
            id: `prod-csv-${Date.now()}-${i}`,
            productName: values[0],
            amazonCode: values[1] || "",
            rakutenCode: values[2] || "",
            qoo10Code: values[3] || "",
          });
        }

        if (errors.length > 0) {
          setCsvError(errors.join("\n"));
        }

        if (newProducts.length > 0) {
          setProducts([...products, ...newProducts]);
          setCsvSuccess(`${newProducts.length}件の商品を追加しました`);
        }
      } catch {
        setCsvError("CSVファイルの解析に失敗しました");
      }
    };

    reader.onerror = () => {
      setCsvError("ファイルの読み込みに失敗しました");
    };

    reader.readAsText(file, "UTF-8");

    // ファイル入力をリセット
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const getProductNameByCode = (
    code: string,
    mallProducts: MallProduct[]
  ): string => {
    const product = mallProducts.find((p) => p.code === code);
    return product ? product.name : "";
  };

  // カスタムドロップダウンコンポーネント
  const ProductCodeDropdown = ({
    value,
    onChange,
    mallProducts,
    mallName,
    mallColor,
  }: {
    value: string;
    onChange: (value: string) => void;
    mallProducts: MallProduct[];
    mallName: string;
    mallColor: string;
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
          setIsOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const selectedProduct = mallProducts.find((p) => p.code === value);
    const displayText = selectedProduct
      ? `${selectedProduct.code} - ${selectedProduct.name}`
      : "-- 選択してください --";

    const colorClasses: Record<string, string> = {
      orange: "focus:ring-orange-500 focus:border-orange-500",
      red: "focus:ring-red-500 focus:border-red-500",
      blue: "focus:ring-blue-500 focus:border-blue-500",
    };

    return (
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-500">{mallName}</label>
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className={`w-full flex items-center justify-between px-3 py-2 border rounded-lg text-sm bg-white hover:bg-gray-50 ${colorClasses[mallColor] || ""}`}
          >
            <span className="truncate text-left">{displayText}</span>
            <ChevronDown className={`w-4 h-4 ml-2 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
          </button>
          {isOpen && (
            <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-48 overflow-auto">
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${value === "" ? "bg-blue-100 font-medium" : ""}`}
              >
                -- 選択してください --
              </button>
              {mallProducts.map((product) => (
                <button
                  key={product.code}
                  type="button"
                  onClick={() => {
                    onChange(product.code);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${value === product.code ? "bg-blue-100 font-medium" : ""}`}
                >
                  {product.code} - {product.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {value && (
          <p className="text-xs text-gray-500 truncate">
            {getProductNameByCode(value, mallProducts)}
          </p>
        )}
      </div>
    );
  };

  // テーブル用の小さいドロップダウン
  const TableDropdown = ({
    value,
    onChange,
    mallProducts,
  }: {
    value: string;
    onChange: (value: string) => void;
    mallProducts: MallProduct[];
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
          setIsOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-2 py-1 border rounded text-sm bg-white hover:bg-gray-50"
        >
          <span className="truncate">{value || "--"}</span>
          <ChevronDown className={`w-3 h-3 ml-1 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
        {isOpen && (
          <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-48 overflow-auto">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setIsOpen(false);
              }}
              className={`w-full text-left px-2 py-1 text-sm hover:bg-blue-50 ${value === "" ? "bg-blue-100 font-medium" : ""}`}
            >
              --
            </button>
            {mallProducts.map((product) => (
              <button
                key={product.code}
                type="button"
                onClick={() => {
                  onChange(product.code);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-2 py-1 text-sm hover:bg-blue-50 ${value === product.code ? "bg-blue-100 font-medium" : ""}`}
              >
                {product.code}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Package className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-800">商品登録</h1>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          disabled={isAdding}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-5 h-5" />
          新規登録
        </button>
      </div>

      <p className="text-gray-600 mb-6">
        商品名と各モールでの商品コードを紐付けて登録します。
        各モールの商品コードはプルダウンから選択できます。
      </p>

      {/* CSV入稿セクション */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">CSV一括登録</h2>
        <div className="flex flex-wrap gap-4 items-center">
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Download className="w-5 h-5" />
            テンプレートDL
          </button>

          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv"
              onChange={handleCsvImport}
              className="hidden"
              id="csv-upload"
            />
            <label
              htmlFor="csv-upload"
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors cursor-pointer"
            >
              <Upload className="w-5 h-5" />
              CSVアップロード
            </label>
          </div>
        </div>

        {csvError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm whitespace-pre-line">
            {csvError}
          </div>
        )}

        {csvSuccess && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            {csvSuccess}
          </div>
        )}

        <p className="mt-4 text-sm text-gray-500">
          CSVフォーマット: 商品名, Amazon商品コード, 楽天商品コード, Qoo10商品コード
        </p>
      </div>

      {/* 新規登録フォーム */}
      {isAdding && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">新規商品登録</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                商品名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newProduct.productName}
                onChange={(e) =>
                  setNewProduct({ ...newProduct, productName: e.target.value })
                }
                placeholder="例: オーガニックシャンプー"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ProductCodeDropdown
                value={newProduct.amazonCode}
                onChange={(value) => setNewProduct({ ...newProduct, amazonCode: value })}
                mallProducts={mockAmazonProducts}
                mallName="Amazon"
                mallColor="orange"
              />
              <ProductCodeDropdown
                value={newProduct.rakutenCode}
                onChange={(value) => setNewProduct({ ...newProduct, rakutenCode: value })}
                mallProducts={mockRakutenProducts}
                mallName="楽天"
                mallColor="red"
              />
              <ProductCodeDropdown
                value={newProduct.qoo10Code}
                onChange={(value) => setNewProduct({ ...newProduct, qoo10Code: value })}
                mallProducts={mockQoo10Products}
                mallName="Qoo10"
                mallColor="blue"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleAddProduct}
                disabled={!newProduct.productName}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                登録する
              </button>
              <button
                onClick={() => {
                  setIsAdding(false);
                  setNewProduct({
                    productName: "",
                    amazonCode: "",
                    rakutenCode: "",
                    qoo10Code: "",
                  });
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 登録済み商品一覧 */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  商品名
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  <span className="text-orange-600">Amazon</span>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  <span className="text-red-600">楽天</span>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  <span className="text-blue-600">Qoo10</span>
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    登録されている商品はありません
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    {editingId === product.id ? (
                      <>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={editProduct.productName}
                            onChange={(e) =>
                              setEditProduct({
                                ...editProduct,
                                productName: e.target.value,
                              })
                            }
                            className="w-full px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <TableDropdown
                            value={editProduct.amazonCode}
                            onChange={(value) =>
                              setEditProduct({
                                ...editProduct,
                                amazonCode: value,
                              })
                            }
                            mallProducts={mockAmazonProducts}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <TableDropdown
                            value={editProduct.rakutenCode}
                            onChange={(value) =>
                              setEditProduct({
                                ...editProduct,
                                rakutenCode: value,
                              })
                            }
                            mallProducts={mockRakutenProducts}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <TableDropdown
                            value={editProduct.qoo10Code}
                            onChange={(value) =>
                              setEditProduct({
                                ...editProduct,
                                qoo10Code: value,
                              })
                            }
                            mallProducts={mockQoo10Products}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => handleSaveEdit(product.id)}
                              className="p-1 text-green-600 hover:bg-green-100 rounded"
                              title="保存"
                            >
                              <Save className="w-5 h-5" />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                              title="キャンセル"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {product.productName}
                        </td>
                        <td className="px-4 py-3">
                          {product.amazonCode ? (
                            <div>
                              <span className="text-sm font-mono text-orange-600">
                                {product.amazonCode}
                              </span>
                              <p className="text-xs text-gray-500 truncate max-w-[200px]">
                                {getProductNameByCode(
                                  product.amazonCode,
                                  mockAmazonProducts
                                )}
                              </p>
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {product.rakutenCode ? (
                            <div>
                              <span className="text-sm font-mono text-red-600">
                                {product.rakutenCode}
                              </span>
                              <p className="text-xs text-gray-500 truncate max-w-[200px]">
                                {getProductNameByCode(
                                  product.rakutenCode,
                                  mockRakutenProducts
                                )}
                              </p>
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {product.qoo10Code ? (
                            <div>
                              <span className="text-sm font-mono text-blue-600">
                                {product.qoo10Code}
                              </span>
                              <p className="text-xs text-gray-500 truncate max-w-[200px]">
                                {getProductNameByCode(
                                  product.qoo10Code,
                                  mockQoo10Products
                                )}
                              </p>
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => handleStartEdit(product)}
                              className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                              title="編集"
                            >
                              <Edit2 className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(product.id)}
                              className="p-1 text-red-600 hover:bg-red-100 rounded"
                              title="削除"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
