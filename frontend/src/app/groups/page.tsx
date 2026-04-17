"use client";

import { useEffect, useState } from "react";
import { Users, Eye, EyeOff, MessageSquare } from "lucide-react";
import { getGroups, toggleGroupMonitoring } from "@/lib/api";
import type { Group } from "@/types";

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getGroups()
      .then(setGroups)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (id: number) => {
    const result = await toggleGroupMonitoring(id);
    setGroups((prev) =>
      prev.map((g) => (g.id === id ? { ...g, is_monitored: (result as Group).is_monitored } : g))
    );
  };

  const filtered = groups.filter((g) =>
    g.title.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Users className="w-6 h-6 text-green-400" />
        <h1 className="text-2xl font-bold">Gruplar</h1>
        <span className="text-sm text-gray-500">({groups.length} toplam)</span>
      </div>

      <input
        type="text"
        placeholder="Grup ara..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((group) => (
          <div
            key={group.id}
            className={`p-4 rounded-xl border transition-colors ${
              group.is_monitored
                ? "bg-gray-800 border-gray-700"
                : "bg-gray-900 border-gray-800 opacity-60"
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-medium text-sm truncate flex-1 mr-2">{group.title}</h3>
              <button
                onClick={() => handleToggle(group.id)}
                className={`p-1.5 rounded-lg transition-colors ${
                  group.is_monitored
                    ? "bg-green-900 text-green-400 hover:bg-green-800"
                    : "bg-gray-700 text-gray-500 hover:bg-gray-600"
                }`}
                title={group.is_monitored ? "Izlemeyi Durdur" : "Izlemeyi Baslat"}
              >
                {group.is_monitored ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{group.message_count} mesaj</span>
              </div>
              {group.member_count && (
                <div className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  <span>{group.member_count}</span>
                </div>
              )}
            </div>
            {group.last_activity && (
              <p className="text-xs text-gray-600 mt-2">
                Son: {new Date(group.last_activity).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
