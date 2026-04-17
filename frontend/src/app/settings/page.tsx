"use client";

import { useEffect, useState } from "react";
import { Settings, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { getKeywords, createKeyword, deleteKeyword, toggleKeyword } from "@/lib/api";
import type { Keyword } from "@/types";

const CATEGORIES = [
  { value: "brand", label: "Marka" },
  { value: "issue", label: "Sorun" },
  { value: "person", label: "Kisi" },
  { value: "custom", label: "Ozel" },
];

export default function SettingsPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [newCategory, setNewCategory] = useState("custom");
  const [loading, setLoading] = useState(true);

  const fetchKeywords = async () => {
    const data = await getKeywords();
    setKeywords(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchKeywords();
  }, []);

  const handleAdd = async () => {
    if (!newKeyword.trim()) return;
    await createKeyword(newKeyword.trim(), newCategory);
    setNewKeyword("");
    fetchKeywords();
  };

  const handleDelete = async (id: number) => {
    await deleteKeyword(id);
    setKeywords((prev) => prev.filter((k) => k.id !== id));
  };

  const handleToggle = async (id: number) => {
    await toggleKeyword(id);
    setKeywords((prev) =>
      prev.map((k) => (k.id === id ? { ...k, is_active: !k.is_active } : k))
    );
  };

  const grouped = CATEGORIES.map((cat) => ({
    ...cat,
    items: keywords.filter((k) => k.category === cat.value),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-gray-400" />
        <h1 className="text-2xl font-bold">Ayarlar</h1>
      </div>

      {/* Yeni Anahtar Kelime Ekle */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h2 className="text-lg font-semibold mb-4">Anahtar Kelime Ekle</h2>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Anahtar kelime..."
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Ekle
          </button>
        </div>
      </div>

      {/* Keyword Listesi */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      ) : (
        grouped.map((group) => (
          <div key={group.value} className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h2 className="text-lg font-semibold mb-3">
              {group.label}
              <span className="text-sm font-normal text-gray-500 ml-2">
                ({group.items.length})
              </span>
            </h2>
            {group.items.length === 0 ? (
              <p className="text-gray-500 text-sm">Bu kategoride anahtar kelime yok</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {group.items.map((kw) => (
                  <div
                    key={kw.id}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      kw.is_active
                        ? "bg-gray-900 border-gray-600 text-gray-200"
                        : "bg-gray-900/50 border-gray-700 text-gray-500 line-through"
                    }`}
                  >
                    <span>{kw.keyword}</span>
                    <button
                      onClick={() => handleToggle(kw.id)}
                      className="text-gray-500 hover:text-blue-400 transition-colors"
                      title={kw.is_active ? "Devre Disi Birak" : "Aktif Et"}
                    >
                      {kw.is_active ? (
                        <ToggleRight className="w-4 h-4 text-green-400" />
                      ) : (
                        <ToggleLeft className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(kw.id)}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                      title="Sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}

      {/* Bilgi */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h2 className="text-lg font-semibold mb-3">Sistem Bilgisi</h2>
        <div className="space-y-2 text-sm text-gray-400">
          <p>Analiz Modeli: Claude Sonnet</p>
          <p>Batch Boyutu: 10 mesaj</p>
          <p>Batch Timeout: 30 saniye</p>
          <p>Gunluk Ozet Saati: 09:00</p>
          <p>Alert Esigi: Oncelik 4+</p>
        </div>
      </div>
    </div>
  );
}
