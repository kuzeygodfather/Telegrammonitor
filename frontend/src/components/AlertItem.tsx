"use client";

import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import type { Alert } from "@/types";

const urgencyColors: Record<number, string> = {
  1: "bg-green-500",
  2: "bg-blue-500",
  3: "bg-yellow-500",
  4: "bg-orange-500",
  5: "bg-red-500",
};

interface AlertItemProps {
  alert: Alert;
  onMarkRead?: (id: number) => void;
}

export default function AlertItem({ alert, onMarkRead }: AlertItemProps) {
  const timeAgo = (() => {
    try {
      return formatDistanceToNow(new Date(alert.created_at), { addSuffix: true, locale: tr });
    } catch {
      return alert.created_at;
    }
  })();

  return (
    <div
      className={`p-4 rounded-lg border transition-colors ${
        alert.is_read
          ? "bg-gray-800/50 border-gray-700"
          : "bg-gray-800 border-gray-600"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`inline-block w-3 h-3 rounded-full mt-1.5 flex-shrink-0 ${
            urgencyColors[alert.urgency] || "bg-gray-500"
          }`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded">
              {alert.group_title}
            </span>
            <span className="text-xs text-gray-500">
              Oncelik: {alert.urgency}/5
            </span>
            <span className="text-xs text-gray-600">{timeAgo}</span>
          </div>
          <p className="text-sm font-medium mt-1">{alert.title}</p>
          {alert.description && (
            <p className="text-xs text-gray-400 mt-1">{alert.description}</p>
          )}
        </div>
        {!alert.is_read && onMarkRead && (
          <button
            onClick={() => onMarkRead(alert.id)}
            className="text-xs text-blue-400 hover:text-blue-300 flex-shrink-0"
          >
            Okundu
          </button>
        )}
      </div>
    </div>
  );
}
